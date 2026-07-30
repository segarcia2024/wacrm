import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { processAppointmentReminders } from "@/lib/appointments/process-reminders";

/**
 * Drain due appointment reminders (24h before).
 * Auth: `x-cron-secret` must match `AUTOMATION_CRON_SECRET`
 * (same secret as automations/flows cron).
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-cron-secret") ?? "";
  if (supplied !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processAppointmentReminders(supabaseAdmin());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[appointments-cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
