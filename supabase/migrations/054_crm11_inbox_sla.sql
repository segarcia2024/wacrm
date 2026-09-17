-- ============================================================
-- 054_crm11_inbox_sla.sql
-- Conversation operational status + SLA tracking.
-- Additive only: keeps conversations.status intact.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS operational_status TEXT
    CHECK (
      operational_status IS NULL
      OR operational_status IN (
        'new',
        'open',
        'waiting_customer',
        'waiting_team',
        'resolved',
        'archived'
      )
    );

COMMENT ON COLUMN conversations.operational_status IS
  'CRM 1.1 operational state. NULL = derive from status + last message. Distinct from conversations.status.';

CREATE INDEX IF NOT EXISTS idx_conversations_operational_status
  ON conversations(operational_status)
  WHERE operational_status IS NOT NULL;

-- SLA row per conversation (first customer msg → first human agent reply)
CREATE TABLE IF NOT EXISTS conversation_sla (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  first_customer_at TIMESTAMPTZ NOT NULL,
  first_agent_at TIMESTAMPTZ,
  response_minutes NUMERIC(12, 2),
  target_minutes INTEGER NOT NULL DEFAULT 5,
  breached BOOLEAN NOT NULL DEFAULT FALSE,
  is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  notified_5_at TIMESTAMPTZ,
  notified_10_at TIMESTAMPTZ,
  notified_15_at TIMESTAMPTZ,
  assigned_agent_id UUID,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_sla_open
  ON conversation_sla(account_id, first_customer_at)
  WHERE first_agent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_sla_breached
  ON conversation_sla(account_id, breached)
  WHERE breached = TRUE;

ALTER TABLE conversation_sla ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_sla_select ON conversation_sla;
DROP POLICY IF EXISTS conversation_sla_insert ON conversation_sla;
DROP POLICY IF EXISTS conversation_sla_update ON conversation_sla;

CREATE POLICY conversation_sla_select ON conversation_sla FOR SELECT
  USING (
    account_id IS NOT NULL AND is_account_member(account_id)
  );

-- Writes via service_role / webhook; authenticated agents may update flags
CREATE POLICY conversation_sla_insert ON conversation_sla FOR INSERT
  WITH CHECK (
    account_id IS NOT NULL AND is_account_member(account_id, 'agent')
  );

CREATE POLICY conversation_sla_update ON conversation_sla FOR UPDATE
  USING (
    account_id IS NOT NULL AND is_account_member(account_id, 'agent')
  );

DROP TRIGGER IF EXISTS set_updated_at ON conversation_sla;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversation_sla
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Extend notifications types for SLA alerts (additive CHECK replace)
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'appointment_reminder',
    'sla_breach_5',
    'sla_breach_10',
    'sla_breach_15',
    'appointment_no_show'
  ));
