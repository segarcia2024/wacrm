-- ============================================================
-- 041_round_robin_assignment.sql — atomic round-robin claim
--
-- Automations' `assign_conversation` step supports mode
-- `round_robin`. Until now the engine stubbed that path by
-- picking `.limit(1)` from profiles — not a rotation.
--
-- This migration:
--   1. Adds `accounts.round_robin_cursor_user_id` — last agent
--      who received a round-robin assignment for the account.
--   2. Adds `claim_next_round_robin_agent(p_account_id)` which
--      locks the account row, picks the next eligible member
--      (owner | admin | agent, ordered by user_id), advances
--      the cursor, and returns that user_id. Concurrent claims
--      serialize on the row lock.
--
-- Eligible pool is `agent` only — owner/admin manage the account
-- and viewers are read-only; neither enters the rotation.
--
-- EXECUTE is granted to `service_role` only: the automation
-- engine runs with the service-role client (auth.uid() is null),
-- and authenticated clients must not advance the cursor.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---- cursor column -----------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS round_robin_cursor_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN accounts.round_robin_cursor_user_id IS
  'Last user_id that received a round-robin conversation assignment; advanced by claim_next_round_robin_agent.';

-- ---- claim RPC ---------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_round_robin_agent(
  p_account_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor UUID;
  v_agents UUID[];
  v_next UUID;
  v_n INT;
  v_i INT;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serialize concurrent claims for this account.
  SELECT round_robin_cursor_user_id
  INTO v_cursor
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT ARRAY_AGG(p.user_id ORDER BY p.user_id)
  INTO v_agents
  FROM profiles p
  WHERE p.account_id = p_account_id
    AND p.account_role = 'agent';

  v_n := COALESCE(array_length(v_agents, 1), 0);
  IF v_n = 0 THEN
    RETURN NULL;
  END IF;

  -- Default: first agent (no cursor, or cursor left the pool).
  v_next := v_agents[1];

  IF v_cursor IS NOT NULL THEN
    FOR v_i IN 1..v_n LOOP
      IF v_agents[v_i] = v_cursor THEN
        IF v_i < v_n THEN
          v_next := v_agents[v_i + 1];
        ELSE
          v_next := v_agents[1];
        END IF;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  UPDATE accounts
  SET
    round_robin_cursor_user_id = v_next,
    updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_next;
END;
$$;

ALTER FUNCTION public.claim_next_round_robin_agent(UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.claim_next_round_robin_agent(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_round_robin_agent(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_round_robin_agent(UUID) TO service_role;
