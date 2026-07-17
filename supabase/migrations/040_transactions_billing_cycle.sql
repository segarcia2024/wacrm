-- ============================================================
-- 040_transactions_billing_cycle.sql — Billing cycle on checkout
--
-- Stores the prepaid billing period (months) selected at checkout.
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS billing_cycle_months integer NOT NULL DEFAULT 1
    CHECK (billing_cycle_months IN (1, 3, 6, 12));
