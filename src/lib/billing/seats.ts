import type { SupabaseClient } from "@supabase/supabase-js";

import { hasMinRole, isAccountRole, type AccountRole } from "@/lib/auth/roles";

/** Roles that consume a paid advisor seat. Viewers are free. */
export function roleConsumesSeat(role: string): boolean {
  return isAccountRole(role) && hasMinRole(role, "agent");
}

export interface SeatUsage {
  licensedSeats: number;
  usedSeats: number;
  pendingAgentInvites: number;
}

/**
 * Licensed seats = sum of approved checkouts. Zero means "no paid plan
 * yet" — callers should not block existing tenants (grandfather).
 */
export async function loadSeatUsage(
  db: SupabaseClient,
  accountId: string,
): Promise<SeatUsage> {
  const [txRes, membersRes, invitesRes] = await Promise.all([
    db
      .from("transactions")
      .select("seats_purchased")
      .eq("account_id", accountId)
      .eq("status", "approved"),
    db
      .from("profiles")
      .select("account_role")
      .eq("account_id", accountId),
    db
      .from("account_invitations")
      .select("role")
      .eq("account_id", accountId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const licensedSeats = (txRes.data ?? []).reduce(
    (sum, row) => sum + (row.seats_purchased ?? 0),
    0,
  );
  const usedSeats = (membersRes.data ?? []).filter((row) =>
    roleConsumesSeat(row.account_role ?? ""),
  ).length;
  const pendingAgentInvites = (invitesRes.data ?? []).filter((row) =>
    roleConsumesSeat(row.role ?? ""),
  ).length;

  return { licensedSeats, usedSeats, pendingAgentInvites };
}

/**
 * True when this invite/join should be refused.
 * No approved transactions → do not enforce (grandfather).
 */
export function exceedsLicensedSeats(
  usage: SeatUsage,
  incomingRole: AccountRole,
  opts: { countPendingInvites: boolean } = { countPendingInvites: true },
): boolean {
  if (!roleConsumesSeat(incomingRole)) return false;
  if (usage.licensedSeats <= 0) return false;
  const reserved = opts.countPendingInvites ? usage.pendingAgentInvites : 0;
  return usage.usedSeats + reserved >= usage.licensedSeats;
}

export function seatsExceededMessage(usage: SeatUsage): string {
  return `No hay asientos disponibles (${usage.usedSeats} de ${usage.licensedSeats} en uso). Amplíe el plan o archive un asesor.`;
}
