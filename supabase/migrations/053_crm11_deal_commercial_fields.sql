-- ============================================================
-- 053_crm11_deal_commercial_fields.sql
-- Optional commercial fields on deals + alternate vehicles bridge.
-- No NOT NULL; no mass UPDATE. Idempotent.
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS purchase_timeline TEXT,
  ADD COLUMN IF NOT EXISTS trade_in BOOLEAN,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loss_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observations TEXT;

COMMENT ON COLUMN deals.source IS 'Lead/opportunity source (optional CRM 1.1).';
COMMENT ON COLUMN deals.payment_method IS 'Payment method (optional).';
COMMENT ON COLUMN deals.budget IS 'Estimated budget COP (optional).';
COMMENT ON COLUMN deals.purchase_timeline IS 'Purchase timeline label (optional).';
COMMENT ON COLUMN deals.trade_in IS 'Customer delivers vehicle as trade-in.';
COMMENT ON COLUMN deals.next_action IS 'Next commercial action description.';
COMMENT ON COLUMN deals.next_action_at IS 'Due datetime for next action.';
COMMENT ON COLUMN deals.loss_reason IS 'Structured loss reason (notes left intact).';
COMMENT ON COLUMN deals.closed_at IS 'Actual close date when won/lost.';
COMMENT ON COLUMN deals.observations IS 'Free-form commercial observations.';

CREATE INDEX IF NOT EXISTS idx_deals_next_action_at
  ON deals(next_action_at)
  WHERE next_action_at IS NOT NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_deals_closed_at
  ON deals(closed_at)
  WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS deal_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deal_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_vehicles_deal ON deal_vehicles(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_vehicles_vehicle ON deal_vehicles(vehicle_id);

ALTER TABLE deal_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_vehicles_select ON deal_vehicles;
DROP POLICY IF EXISTS deal_vehicles_insert ON deal_vehicles;
DROP POLICY IF EXISTS deal_vehicles_update ON deal_vehicles;
DROP POLICY IF EXISTS deal_vehicles_delete ON deal_vehicles;

CREATE POLICY deal_vehicles_select ON deal_vehicles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_vehicles.deal_id
        AND d.account_id IS NOT NULL
        AND is_account_member(d.account_id)
    )
  );

CREATE POLICY deal_vehicles_insert ON deal_vehicles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_vehicles.deal_id
        AND d.account_id IS NOT NULL
        AND is_account_member(d.account_id, 'agent')
    )
  );

CREATE POLICY deal_vehicles_update ON deal_vehicles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_vehicles.deal_id
        AND d.account_id IS NOT NULL
        AND is_account_member(d.account_id, 'agent')
    )
  );

CREATE POLICY deal_vehicles_delete ON deal_vehicles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_vehicles.deal_id
        AND d.account_id IS NOT NULL
        AND is_account_member(d.account_id, 'admin')
    )
  );
