import type { Deal } from "@/types";

/** Fields that contribute to commercial profile completeness. */
export const COMMERCIAL_PROFILE_FIELDS = [
  "name",
  "phone",
  "source",
  "vehicle",
  "budget",
  "payment_method",
  "purchase_timeline",
  "assigned_to",
] as const;

export type CommercialProfileField = (typeof COMMERCIAL_PROFILE_FIELDS)[number];

export interface CommercialIntegrity {
  percent: number;
  missing: CommercialProfileField[];
  present: CommercialProfileField[];
}

const LABELS_ES: Record<CommercialProfileField, string> = {
  name: "nombre",
  phone: "teléfono",
  source: "fuente",
  vehicle: "vehículo",
  budget: "presupuesto",
  payment_method: "método de pago",
  purchase_timeline: "plazo",
  assigned_to: "responsable",
};

export function commercialFieldLabel(field: CommercialProfileField): string {
  return LABELS_ES[field];
}

/**
 * Score a contact + optional open deal for commercial completeness.
 * Does not require filling everything — advisory only.
 */
export function computeCommercialIntegrity(input: {
  name?: string | null;
  phone?: string | null;
  deal?: Pick<
    Deal,
    | "source"
    | "vehicle_id"
    | "budget"
    | "payment_method"
    | "purchase_timeline"
    | "assigned_to"
  > | null;
}): CommercialIntegrity {
  const checks: Record<CommercialProfileField, boolean> = {
    name: Boolean(input.name?.trim()),
    phone: Boolean(input.phone?.trim()),
    source: Boolean(input.deal?.source?.trim()),
    vehicle: Boolean(input.deal?.vehicle_id),
    budget: input.deal?.budget != null && Number(input.deal.budget) > 0,
    payment_method: Boolean(input.deal?.payment_method?.trim()),
    purchase_timeline: Boolean(input.deal?.purchase_timeline?.trim()),
    assigned_to: Boolean(input.deal?.assigned_to),
  };

  const present = COMMERCIAL_PROFILE_FIELDS.filter((f) => checks[f]);
  const missing = COMMERCIAL_PROFILE_FIELDS.filter((f) => !checks[f]);
  const percent = Math.round(
    (present.length / COMMERCIAL_PROFILE_FIELDS.length) * 100,
  );

  return { percent, missing, present };
}

/** Soft warnings when moving a deal (before crm11_required_fields blocks). */
export function dealStageWarnings(
  stageName: string,
  deal: Partial<Deal>,
  requireStrict: boolean,
): string[] {
  const name = stageName.toLowerCase();
  const warnings: string[] = [];

  if (name.includes("calific") || name.includes("qualif")) {
    if (!deal.payment_method) warnings.push("Falta método de pago");
    if (!deal.purchase_timeline) warnings.push("Falta plazo de compra");
  }
  if (name.includes("cita") || name.includes("appointment")) {
    if (!deal.assigned_to) warnings.push("Falta responsable");
  }
  if (deal.status === "lost" || name.includes("perdid") || name.includes("lost")) {
    if (!deal.loss_reason) warnings.push("Falta motivo de pérdida");
  }
  if (deal.status === "won" || name.includes("ganad") || name.includes("won")) {
    if (!deal.closed_at && !deal.expected_close_date) {
      warnings.push("Falta fecha de venta");
    }
  }
  if (deal.status === "open" || deal.status == null) {
    if (!deal.next_action) warnings.push("Falta próxima acción");
  }

  if (!requireStrict) return warnings;
  return warnings;
}

/**
 * Detect possible duplicate contacts by normalized phone or similar name.
 * Advisory only — never auto-merge.
 */
export function findPossibleDuplicateIds(
  contacts: Array<{
    id: string;
    name?: string | null;
    phone?: string | null;
    phone_normalized?: string | null;
  }>,
  current: {
    id: string;
    name?: string | null;
    phone?: string | null;
    phone_normalized?: string | null;
  },
): string[] {
  const norm =
    current.phone_normalized ||
    current.phone?.replace(/\D/g, "") ||
    "";
  const nameKey = (current.name ?? "").trim().toLowerCase();
  const hits = new Set<string>();

  for (const c of contacts) {
    if (c.id === current.id) continue;
    const cNorm = c.phone_normalized || c.phone?.replace(/\D/g, "") || "";
    if (norm && cNorm && norm === cNorm) hits.add(c.id);
    const cName = (c.name ?? "").trim().toLowerCase();
    if (nameKey.length >= 4 && cName === nameKey) hits.add(c.id);
  }
  return [...hits];
}
