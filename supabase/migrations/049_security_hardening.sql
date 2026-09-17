-- ============================================================
-- 049_security_hardening.sql
--
-- Closes Security Advisor findings for:
--   - SECURITY DEFINER functions executable by anon / authenticated
--   - mutable search_path on helper / trigger functions
--   - public storage buckets with broad SELECT (listable) policies
--
-- Strategy
--   1. Internal / trigger / ops helpers → revoke from PUBLIC, anon,
--      authenticated; grant only service_role when the backend needs RPC.
--   2. Product RPCs / RLS helpers → revoke from PUBLIC + anon; keep
--      authenticated (+ service_role where already granted).
--   3. peek_invitation stays callable by anon (join page before login).
--   4. Drop broad public SELECT policies on public buckets — object
--      URLs keep working without Storage API listing.
--   5. Pin search_path on the four mutable functions.
--
-- Does NOT enable Auth "leaked password protection" (dashboard toggle)
-- or move the `vector` extension out of public (higher-risk follow-up).
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ============================================================
-- 1) Internal / trigger / backend-only SECURITY DEFINER
-- ============================================================

-- Broadcast incremental counters (trigger internals + ops safety net)
REVOKE ALL ON FUNCTION public._bcast_bump(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_recipient_aggregate_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_broadcast_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid) TO service_role;

-- Auth signup trigger
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Assignment notification trigger
REVOKE ALL ON FUNCTION public.notify_conversation_assigned() FROM PUBLIC, anon, authenticated;

-- One-shot / ops merge helpers (ran at migration time; not client RPCs)
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts_by_wa_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts_by_wa_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_conversations() TO service_role;

-- AI / webhook / round-robin — service_role only
REVOKE ALL ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.claim_next_round_robin_agent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_round_robin_agent(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role;

-- ============================================================
-- 2) Product RPCs + RLS helpers — authenticated (not anon)
-- ============================================================

REVOKE ALL ON FUNCTION public.set_member_role(uuid, public.account_role_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, public.account_role_enum) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_account_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_account_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_account_ownership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.touch_presence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(text) TO authenticated;

REVOKE ALL ON FUNCTION public.redeem_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(text) TO authenticated;

-- RLS helpers: needed by authenticated policies; never by anon
REVOKE ALL ON FUNCTION public.is_account_member(uuid, public.account_role_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_member(uuid, public.account_role_enum) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_view_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_conversation(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_view_deal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_deal(uuid, uuid) TO authenticated, service_role;

-- Join page may peek before login; redeem stays authenticated-only above
REVOKE ALL ON FUNCTION public.peek_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_invitation(text) TO anon, authenticated;

-- ============================================================
-- 3) Public buckets: remove listable SELECT policies
--    Public object URLs continue to work without these.
-- ============================================================

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;

-- ============================================================
-- 4) Pin search_path on mutable functions
-- ============================================================

ALTER FUNCTION public.update_ai_knowledge_documents_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public._bcast_cols_for_status(text)
  SET search_path = public;

ALTER FUNCTION public.update_ai_configs_updated_at()
  SET search_path = public;

-- Hygiene: broadcast helper is trigger-internal, not a client RPC
REVOKE ALL ON FUNCTION public._bcast_cols_for_status(text) FROM PUBLIC, anon, authenticated;
