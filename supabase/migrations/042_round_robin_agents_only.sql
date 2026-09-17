-- ============================================================
-- 042_round_robin_agents_only.sql
--
-- Narrows claim_next_round_robin_agent so the rotation pool is
-- role = 'agent' only (excludes owner / admin / viewer).
--
-- Safe if 041 was already applied with the wider pool, and
-- idempotent if 041 already shipped with agents-only.
-- ============================================================

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
