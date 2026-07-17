-- ============================================================
-- 038_billing_transactions.sql — Wompi B2B license checkouts
--
-- One row per checkout attempt against Wompi Web Checkout.
-- `account_id` is the tenant (concesionario) purchasing seats.
--
-- Status lifecycle (application-managed):
--   pending  → checkout created, awaiting Wompi confirmation
--   approved → payment settled (webhook / reconciliation)
--   declined → payment rejected or expired
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reference        uuid NOT NULL UNIQUE,
  amount_in_cents  integer NOT NULL CHECK (amount_in_cents > 0),
  currency         text NOT NULL DEFAULT 'COP' CHECK (currency = 'COP'),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'declined')),
  seats_purchased  integer NOT NULL CHECK (seats_purchased > 0),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_account_id_idx
  ON transactions (account_id);

CREATE INDEX IF NOT EXISTS transactions_status_idx
  ON transactions (status);

DROP TRIGGER IF EXISTS set_updated_at ON transactions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- SELECT: any account member may audit billing history.
DROP POLICY IF EXISTS transactions_select ON transactions;
CREATE POLICY transactions_select ON transactions FOR SELECT
  USING (is_account_member(account_id));

-- INSERT: admin+ initiates a checkout for their tenant.
DROP POLICY IF EXISTS transactions_insert ON transactions;
CREATE POLICY transactions_insert ON transactions FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

-- UPDATE: admin+ (webhook handlers should use service role).
DROP POLICY IF EXISTS transactions_update ON transactions;
CREATE POLICY transactions_update ON transactions FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

-- DELETE: not exposed to clients; rows are an audit trail.
