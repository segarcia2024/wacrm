// ============================================================
// Round-robin assignment — pure helpers, no I/O.
//
// Mirrors the claim logic in migration
// `041_round_robin_assignment.sql` (`claim_next_round_robin_agent`)
// so unit tests and the SQL RPC stay aligned: given a sorted pool
// and the last-assigned cursor, return the next agent and wrap.
//
// Eligible pool (enforced by the RPC): account members with role
// `agent` only. Owner/admin manage the account; viewers are
// read-only — neither enters the rotation.
// ============================================================

/**
 * Pick the next agent in a classic round-robin rotation.
 *
 * @param agentIds - Eligible agents, already sorted ascending by
 *   `user_id` (stable order so every caller agrees on "next").
 * @param lastAssignedId - Cursor from the previous claim
 *   (`accounts.round_robin_cursor_user_id`). Null on the first
 *   claim for the account.
 * @returns The next `user_id`, or `null` when the pool is empty.
 */
export function pickNextRoundRobinAgent(
  agentIds: readonly string[],
  lastAssignedId: string | null | undefined,
): string | null {
  if (agentIds.length === 0) return null;

  if (!lastAssignedId) {
    return agentIds[0] ?? null;
  }

  const idx = agentIds.indexOf(lastAssignedId);
  if (idx === -1) {
    // Cursor points at someone who left the pool (removed / demoted
    // to viewer). Restart at the head so rotation stays defined.
    return agentIds[0] ?? null;
  }

  const nextIdx = (idx + 1) % agentIds.length;
  return agentIds[nextIdx] ?? null;
}

/** Roles that may receive round-robin conversation assignments. */
export const ROUND_ROBIN_ELIGIBLE_ROLES = ["agent"] as const;
