-- ============================================================
-- 037_cop_currency_defaults
--
-- Colombian DMS: all monetary values operate in whole-number COP.
-- Updates column defaults and normalizes existing rows.
-- ============================================================

ALTER TABLE accounts
  ALTER COLUMN default_currency SET DEFAULT 'COP';

ALTER TABLE deals
  ALTER COLUMN currency SET DEFAULT 'COP';

-- Normalize legacy USD/EUR rows and strip fractional centavos.
UPDATE accounts
SET default_currency = 'COP'
WHERE default_currency IS DISTINCT FROM 'COP';

UPDATE deals
SET
  currency = 'COP',
  value = ROUND(value)
WHERE currency IS DISTINCT FROM 'COP'
   OR value <> ROUND(value);
