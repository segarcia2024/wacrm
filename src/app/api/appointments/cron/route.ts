import { NextResponse } from "next/server";
import { unauthorizedCronResponse } from "@/lib/auth/cron-secret";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { processAppointmentReminders } from "@/lib/appointments/process-reminders";

/**
 * Drain due appointment reminders (24h before).
 * Auth: `x-cron-secret` must match `AUTOMATION_CRON_SECRET`
 * (same secret as automations/flows cron).
 */
export async function GET(request: Request) {
  const denied = unauthorizedCronResponse(request);
  if (denied) return denied;

  try {
    const result = await processAppointmentReminders(supabaseAdmin());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[appointments-cron]", message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
