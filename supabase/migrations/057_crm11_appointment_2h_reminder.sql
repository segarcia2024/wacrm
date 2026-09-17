-- ============================================================
-- 057_crm11_appointment_2h_reminder.sql
-- Additive 2-hour reminder stamps (24h stamps already exist).
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS client_reminder_2h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_reminder_2h_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN appointments.client_reminder_2h_sent_at IS
  'CRM 1.1: WhatsApp reminder ~2h before (only if still scheduled/confirmed).';
