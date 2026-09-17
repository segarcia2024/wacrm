-- ============================================================
-- 045_deals_assigned_visibility.sql
--
-- Pipeline visibility for agents/viewers: assigned to them OR
-- unassigned. Owner/admin keep full account pipeline (shared).
--
-- deals.assigned_to stores profiles.id (not auth.uid()) — see
-- migration 002 and deal-form. Mirror inbox 044, but resolve the
-- current user's profile id for the assignment check.
-- ============================================================

-- Helper: can the current user SELECT this deal?
-- admin+ → yes (whole account). Others → unassigned or assigned to self.
CREATE OR REPLACE FUNCTION public.can_view_deal(
  p_account_id UUID,
  p_assigned_to UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_account_member(p_account_id, 'admin')
    OR (
      public.is_account_member(p_account_id)
      AND (
        p_assigned_to IS NULL
        OR p_assigned_to = (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
        )
      )
    );
$$;

ALTER FUNCTION public.can_view_deal(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.can_view_deal(UUID, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_view_deal(UUID, UUID) IS
  'True if auth.uid() may see a deal: admin+ see all; agent/viewer see unassigned or assigned to their profiles.id.';

CREATE INDEX IF NOT EXISTS idx_deals_account_assigned
  ON deals (account_id, assigned_to);

-- ---- deals -----------------------------------------------------
DROP POLICY IF EXISTS deals_select ON deals;
DROP POLICY IF EXISTS deals_update ON deals;
DROP POLICY IF EXISTS deals_delete ON deals;

CREATE POLICY deals_select ON deals FOR SELECT
  USING (can_view_deal(account_id, assigned_to));

-- Agents may update rows they can see; WITH CHECK stays account-agent
-- so they can reassign away (and then lose SELECT on that row).
CREATE POLICY deals_update ON deals FOR UPDATE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_to IS NULL
        OR assigned_to = (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
        )
      )
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY deals_delete ON deals FOR DELETE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_to IS NULL
        OR assigned_to = (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1
        )
      )
    )
  );
