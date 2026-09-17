/**
 * CRM 1.1 funnel stage helpers — additive, no mass deal moves.
 */

export type StageOutcome = "open" | "won" | "lost";

/** Stages added for funnel_version >= 2 (new deals only). */
export const CRM11_EXTRA_STAGES: Array<{
  name: string;
  color: string;
  outcome: StageOutcome;
  /** Relative order hint among open stages */
  sortHint: number;
}> = [
  { name: "Contactado", color: "#06b6d4", outcome: "open", sortHint: 1 },
  { name: "Cita agendada", color: "#14b8a6", outcome: "open", sortHint: 3 },
  { name: "Asistió", color: "#10b981", outcome: "open", sortHint: 4 },
  { name: "Separado", color: "#f59e0b", outcome: "open", sortHint: 7 },
  { name: "Reactivación", color: "#6366f1", outcome: "open", sortHint: 9 },
];

export const LEGACY_STAGE_OUTCOME_HINTS: Array<{
  match: RegExp;
  outcome: StageOutcome;
}> = [
  { match: /cerrado\s*ganado|closed\s*won|^won$|^ganado$/i, outcome: "won" },
  { match: /venta\s*perdida|perdid|lost/i, outcome: "lost" },
];

export function inferOutcomeFromName(name: string): StageOutcome {
  for (const h of LEGACY_STAGE_OUTCOME_HINTS) {
    if (h.match.test(name)) return h.outcome;
  }
  return "open";
}

/** Historical deals to depurate: open status, no next_action, or on won/lost-named stage still open. */
export function isHistoricalDealToReview(deal: {
  status?: string | null;
  next_action?: string | null;
  created_at?: string;
  stage?: { name?: string; outcome?: string | null } | null;
  pipelineFunnelVersion?: number;
}): boolean {
  if (deal.status !== "open") return false;
  const outcome = deal.stage?.outcome ?? inferOutcomeFromName(deal.stage?.name ?? "");
  if (outcome !== "open") return true; // misclassified open deal on won/lost stage
  if (!deal.next_action?.trim()) return true;
  return false;
}
