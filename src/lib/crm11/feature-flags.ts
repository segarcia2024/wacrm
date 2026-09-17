/**
 * CRM 1.1 account feature flags.
 * Stored on accounts.feature_flags JSONB. Empty / missing = off (safe rollback).
 */
export const CRM11_FLAGS = [
  "crm11_dashboard",
  "crm11_inbox_ops",
  "crm11_funnel",
  "crm11_sla",
  "crm11_locations",
  "crm11_required_fields",
] as const;

export type Crm11Flag = (typeof CRM11_FLAGS)[number];

export type FeatureFlags = Partial<Record<Crm11Flag, boolean>> &
  Record<string, boolean | undefined>;

export function parseFeatureFlags(raw: unknown): FeatureFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FeatureFlags = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function hasFeature(
  flags: FeatureFlags | null | undefined,
  flag: Crm11Flag,
): boolean {
  return flags?.[flag] === true;
}

/** Default flags for gradual rollout UI (all off until owner enables). */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.fromEntries(
  CRM11_FLAGS.map((f) => [f, false]),
) as FeatureFlags;
