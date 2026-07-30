-- ============================================================
-- APPOINTMENTS (citas) — Fase 3 accesibilidad conversaciones
-- ============================================================
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  -- Agent responsible (profiles.id), same convention as deals.assigned_to
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'other'
    CHECK (type IN ('showroom', 'test_drive', 'call', 'delivery', 'other')),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (duration_minutes > 0 AND duration_minutes <= 24 * 60),
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  client_reminder_sent_at TIMESTAMPTZ,
  agent_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_account_starts
  ON appointments(account_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact
  ON appointments(contact_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned
  ON appointments(assigned_to, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_due
  ON appointments(starts_at)
  WHERE status = 'scheduled'
    AND reminder_enabled = TRUE
    AND (client_reminder_sent_at IS NULL OR agent_reminder_sent_at IS NULL);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
DROP POLICY IF EXISTS appointments_insert ON appointments;
DROP POLICY IF EXISTS appointments_update ON appointments;
DROP POLICY IF EXISTS appointments_delete ON appointments;

CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Extend in-app notifications for agent appointment reminders.
-- Agents have no WhatsApp phone on profiles; client gets WhatsApp,
-- agent gets an in-app notification (and we still mark agent_reminder_sent_at).
DO $$
BEGIN
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'appointment_reminder'));
