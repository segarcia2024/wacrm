import type { Deal } from "@/types";

/**
 * Whether an agent/viewer may keep a deal in local Pipeline state
 * (mirrors SQL `can_view_deal` for non-admin roles).
 * Admins should not use this gate — they see the full account pipeline.
 *
 * `profileId` is `profiles.id` (same convention as `deals.assigned_to`).
 */
export function isDealInAgentScope(
  deal: Pick<Deal, "assigned_to">,
  profileId: string,
): boolean {
  const assignee = deal.assigned_to ?? null;
  return assignee === null || assignee === profileId;
}
