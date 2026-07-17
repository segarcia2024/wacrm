-- ============================================================
-- 039_transactions_setup_fee.sql — Setup fee accounting flag
--
-- Tracks whether a checkout included the one-time implementation
-- fee (configuración inicial y capacitación).
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS includes_setup_fee boolean NOT NULL DEFAULT false;
