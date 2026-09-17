-- ============================================================
-- 056_crm11_automations_observability.sql
-- Lifecycle status + version for automations (additive).
-- Does not delete zero-execution automations.
-- ============================================================

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN (
      'draft',
      'test',
      'active',
      'paused',
      'error'
    )),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN automations.lifecycle_status IS
  'CRM 1.1 lifecycle. Maps with is_active: paused/draft/test/error keep is_active false when appropriate.';

-- Sync lifecycle from existing is_active without destroying data
UPDATE automations
SET lifecycle_status = CASE
  WHEN is_active = FALSE AND lifecycle_status = 'active' THEN 'paused'
  ELSE lifecycle_status
END
WHERE TRUE;

-- Helper: check account feature flag (SECURITY DEFINER for RLS-safe reads)
CREATE OR REPLACE FUNCTION public.account_has_feature(
  p_account_id UUID,
  p_flag TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (feature_flags ->> p_flag)::boolean
     FROM accounts
     WHERE id = p_account_id),
    FALSE
  );
$$;

ALTER FUNCTION public.account_has_feature(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_has_feature(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_has_feature(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.account_has_feature IS
  'Returns true if accounts.feature_flags[flag] is JSON boolean true. Rollback = set flag false or remove key.';
