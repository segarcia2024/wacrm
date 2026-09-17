-- ============================================================
-- 052_crm11_flags_locations_stages.sql
-- Revio CRM 1.1 — additive safety layer:
--   * account feature flags (crm11_*)
--   * locations (sedes) + optional FKs
--   * pipeline_stages.outcome for open/won/lost classification
--   * pipelines.funnel_version for gradual funnel rollout
--
-- RULES: no DROP of existing columns/tables; no mass UPDATE of
-- deals/contacts/conversations. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- Feature flags on accounts (JSONB, empty = all off)
-- Keys: crm11_dashboard, crm11_inbox_ops, crm11_funnel,
--       crm11_sla, crm11_locations, crm11_required_fields
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS feature_flags JSONB
    NOT NULL
    DEFAULT '{}'::jsonb;

COMMENT ON COLUMN accounts.feature_flags IS
  'Account-level feature flags for gradual CRM 1.1 rollout. Empty object = all off. Rollback = remove keys or set false.';

-- ------------------------------------------------------------
-- Locations (sedes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_locations_account
  ON locations(account_id)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_account_name
  ON locations(account_id, lower(name));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS locations_select ON locations;
DROP POLICY IF EXISTS locations_insert ON locations;
DROP POLICY IF EXISTS locations_update ON locations;
DROP POLICY IF EXISTS locations_delete ON locations;

CREATE POLICY locations_select ON locations FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY locations_insert ON locations FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY locations_update ON locations FOR UPDATE
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY locations_delete ON locations FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON locations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Optional location FKs (historical rows stay NULL)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_location ON deals(location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_location ON appointments(location_id)
  WHERE location_id IS NOT NULL;

-- ------------------------------------------------------------
-- Stage outcome classification (does NOT move deals)
-- ------------------------------------------------------------
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'open'
    CHECK (outcome IN ('open', 'won', 'lost'));

COMMENT ON COLUMN pipeline_stages.outcome IS
  'Internal classification for dashboard KPIs. open=active funnel, won=closed won, lost=lost. Does not change deal.status.';

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_outcome
  ON pipeline_stages(pipeline_id, outcome);

-- Heuristic seed ONLY for rows still at default 'open' whose name
-- clearly indicates won/lost. Does not touch deal rows.
UPDATE pipeline_stages
SET outcome = 'won'
WHERE outcome = 'open'
  AND (
    lower(name) LIKE '%cerrado ganado%'
    OR lower(name) LIKE '%closed won%'
    OR lower(name) = 'ganado'
    OR lower(name) = 'won'
  );

UPDATE pipeline_stages
SET outcome = 'lost'
WHERE outcome = 'open'
  AND (
    lower(name) LIKE '%venta perdida%'
    OR lower(name) LIKE '%perdid%'
    OR lower(name) LIKE '%lost%'
  );

-- Gradual funnel version: 1 = legacy stages, 2 = CRM 1.1 stages for new deals
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS funnel_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN pipelines.funnel_version IS
  '1 = historical funnel; 2 = CRM 1.1 stages applied only to newly created deals.';
