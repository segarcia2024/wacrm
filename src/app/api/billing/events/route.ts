import { NextResponse } from "next/server";

import {
  extractWompiTransaction,
  getWompiEventsSecret,
  verifyWompiEventChecksum,
  type WompiEventPayload,
} from "@/lib/billing/wompi-events";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let payload: WompiEventPayload;
  try {
    payload = (await request.json()) as WompiEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let eventsSecret: string;
  try {
    eventsSecret = getWompiEventsSecret();
  } catch {
    console.error("[billing/events] WOMPI_EVENTS_SECRET is not configured");
    return NextResponse.json(
      { error: "Payment events are not configured" },
      { status: 503 },
    );
  }

  if (!verifyWompiEventChecksum(payload, eventsSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const extracted = extractWompiTransaction(payload);
  if (!extracted) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = supabaseAdmin();
  const { data: existing, error: lookupErr } = await admin
    .from("transactions")
    .select("id, status, amount_in_cents")
    .eq("reference", extracted.reference)
    .maybeSingle();

  if (lookupErr) {
    console.error("[billing/events] lookup failed:", lookupErr.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (
    extracted.amountInCents != null &&
    extracted.amountInCents !== existing.amount_in_cents
  ) {
    console.warn("[billing/events] amount mismatch, refusing update", {
      reference: extracted.reference,
      expected: existing.amount_in_cents,
      got: extracted.amountInCents,
    });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
  }

  if (existing.status === extracted.status) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const { error: updateErr } = await admin
    .from("transactions")
    .update({ status: extracted.status })
    .eq("id", existing.id)
    .eq("status", existing.status);

  if (updateErr) {
    console.error("[billing/events] update failed:", updateErr.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: extracted.status });
}
