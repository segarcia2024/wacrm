import { NextResponse } from "next/server";
import { unauthorizedCronResponse } from "@/lib/auth/cron-secret";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { processConversationSla } from "@/lib/crm11/sla";

/**
 * SLA escalation cron: 5 / 10 / 15 minute notifications (no reassignment).
 * Auth: `x-cron-secret` must match `AUTOMATION_CRON_SECRET`.
 */
export async function GET(request: Request) {
  const denied = unauthorizedCronResponse(request);
  if (denied) return denied;

  try {
    const result = await processConversationSla(supabaseAdmin());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[sla-cron]", message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
