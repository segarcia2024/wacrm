-- ============================================================
-- 051_tech_debt_hardening.sql
--
-- Closes leftover debt from the 2026-08 review:
--   1. message_templates unique on (account_id, name, language)
--   2. whatsapp_config.verify_token_hash for O(1) Meta hub verify
--   3. RLS policy on automation_pending_executions
--   4. transactions_update is service_role only (no client-side approve)
--   5. Covering indexes on hot FKs
--   6. (select auth.uid()) on policies that re-evaluate per row
--
-- Idempotent.
-- ============================================================

-- 1) Templates unique per tenant
DROP INDEX IF EXISTS message_templates_user_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_name_language_key
  ON message_templates (account_id, name, language);

-- 2) Hash of plaintext verify token (written by the app on save / first match)
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS verify_token_hash text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_verify_token_hash
  ON whatsapp_config (verify_token_hash)
  WHERE verify_token_hash IS NOT NULL;

-- 3) Cron table: RLS on, no client policies (service_role bypasses RLS)
--    Explicit deny for authenticated so the empty-policy INFO is closed.
DROP POLICY IF EXISTS automation_pending_executions_deny_authenticated
  ON automation_pending_executions;
CREATE POLICY automation_pending_executions_deny_authenticated
  ON automation_pending_executions
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- 4) Only the Wompi webhook (service role) may change payment status
DROP POLICY IF EXISTS transactions_update ON transactions;

-- 5) Hot FK indexes
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals (contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_conversation_id ON deals (conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id ON appointments (conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointments_deal_id ON appointments (deal_id);
CREATE INDEX IF NOT EXISTS idx_notifications_account_id ON notifications (account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id ON notifications (conversation_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_contact_id ON flow_runs (contact_id);
CREATE INDEX IF NOT EXISTS idx_automation_pending_automation_id
  ON automation_pending_executions (automation_id);

-- 6) Same visibility as 044/045, but wrap auth.uid() so Postgres
--    evaluates it once per query (advisor auth_rls_initplan).
DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_agent_id IS NULL
        OR assigned_agent_id = (select auth.uid())
      )
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_agent_id IS NULL
        OR assigned_agent_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS deals_update ON deals;
CREATE POLICY deals_update ON deals FOR UPDATE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_to IS NULL
        OR assigned_to = (
          SELECT p.id FROM public.profiles p
          WHERE p.user_id = (select auth.uid())
          LIMIT 1
        )
      )
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS deals_delete ON deals;
CREATE POLICY deals_delete ON deals FOR DELETE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_to IS NULL
        OR assigned_to = (
          SELECT p.id FROM public.profiles p
          WHERE p.user_id = (select auth.uid())
          LIMIT 1
        )
      )
    )
  );
