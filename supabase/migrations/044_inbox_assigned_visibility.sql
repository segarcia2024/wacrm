-- ============================================================
-- 044_inbox_assigned_visibility.sql
--
-- Inbox visibility for agents/viewers: assigned to them OR
-- unassigned. Owner/admin keep full account inbox (shared).
--
-- Round-robin / automations still write assigned_agent_id; this
-- migration makes that assignment an access boundary for non-admins.
-- ============================================================

-- Helper: can the current user SELECT this conversation?
-- admin+ → yes (whole account). Others → unassigned or assigned to self.
CREATE OR REPLACE FUNCTION public.can_view_conversation(
  p_account_id UUID,
  p_assigned_agent_id UUID
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
        p_assigned_agent_id IS NULL
        OR p_assigned_agent_id = auth.uid()
      )
    );
$$;

ALTER FUNCTION public.can_view_conversation(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.can_view_conversation(UUID, UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_view_conversation(UUID, UUID) IS
  'True if auth.uid() may see a conversation: admin+ see all; agent/viewer see unassigned or assigned to self.';

CREATE INDEX IF NOT EXISTS idx_conversations_account_assigned
  ON conversations (account_id, assigned_agent_id);

-- ---- conversations ---------------------------------------------
DROP POLICY IF EXISTS conversations_select ON conversations;
DROP POLICY IF EXISTS conversations_update ON conversations;
DROP POLICY IF EXISTS conversations_delete ON conversations;

CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (can_view_conversation(account_id, assigned_agent_id));

-- Agents may update rows they can see; WITH CHECK stays account-agent
-- so they can reassign away (and then lose SELECT on that row).
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_agent_id IS NULL
        OR assigned_agent_id = auth.uid()
      )
    )
  )
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (
    is_account_member(account_id, 'admin')
    OR (
      is_account_member(account_id, 'agent')
      AND (
        assigned_agent_id IS NULL
        OR assigned_agent_id = auth.uid()
      )
    )
  );

-- ---- messages (inherit conversation visibility) ----------------
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_modify ON messages;

CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
);

CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent')
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent')
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
);

-- ---- message_reactions -----------------------------------------
DROP POLICY IF EXISTS message_reactions_select ON message_reactions;
DROP POLICY IF EXISTS message_reactions_modify ON message_reactions;

CREATE POLICY message_reactions_select ON message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
);

CREATE POLICY message_reactions_modify ON message_reactions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND is_account_member(c.account_id, 'agent')
      AND can_view_conversation(c.account_id, c.assigned_agent_id)
  )
);
