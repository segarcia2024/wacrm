-- ============================================================
-- 055_crm11_appointments_states.sql
-- Expand appointment statuses + optional commercial fields.
-- Additive CHECK replacement; existing rows remain valid.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN (
    'scheduled',
    'confirmed',
    'rescheduled',
    'cancelled',
    'completed',
    'no_show'
  ));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT;

COMMENT ON COLUMN appointments.result IS 'Outcome notes after the appointment.';
COMMENT ON COLUMN appointments.next_action IS 'Follow-up action after the appointment.';

CREATE INDEX IF NOT EXISTS idx_appointments_vehicle
  ON appointments(vehicle_id)
  WHERE vehicle_id IS NOT NULL;

-- Reminder index: include confirmed (2h reminder path)
DROP INDEX IF EXISTS idx_appointments_reminder_due;
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_due
  ON appointments(starts_at)
  WHERE status IN ('scheduled', 'confirmed')
    AND reminder_enabled = TRUE
    AND (client_reminder_sent_at IS NULL OR agent_reminder_sent_at IS NULL);
