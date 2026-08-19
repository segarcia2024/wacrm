-- ============================================================
-- 050_contact_whatsapp_identity
--
-- WhatsApp Usernames + Business-scoped user IDs (BSUID).
--
-- Meta started sharing `contacts[].user_id` (BSUID) and optional
-- `profile.username` in message webhooks. `wa_id` / `from` may be
-- omitted when the user hides their phone. Internal CRM identity
-- stays `contacts.id`; WhatsApp identifiers are attributes.
--
-- This migration:
--   1. adds contacts.bsuid + contacts.username;
--   2. allows contacts.phone to be NULL (empty string → NULL);
--   3. unique-indexes bsuid per account; indexes username;
--   4. backfills bsuid from LID-shaped wa_id (CC.digits);
--   5. adds optional message audit columns (contact_id, sender_*);
--   6. extends filter_contacts_by_tags search.
--
-- Non-destructive. No rows deleted. Existing phone unique index
-- (022) and wa_id unique index (048) are kept.
-- ============================================================

-- 1) New identity attributes. `user_id` is already the audit FK to
--    auth.users, so the Meta BSUID lives in `bsuid`.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS bsuid TEXT;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS username TEXT;

COMMENT ON COLUMN contacts.bsuid IS
  'WhatsApp Business-scoped user ID (contacts[].user_id / messages[].from_user_id). Stable per business portfolio. Format CC.alphanumeric.';

COMMENT ON COLUMN contacts.username IS
  'WhatsApp profile username without leading @. Profile metadata only — never used as the send destination or primary identity.';

-- 2) Phone may be absent. Generated phone_normalized becomes NULL
--    when phone is NULL; the partial unique index from 022 already
--    excludes empty values.
ALTER TABLE contacts
  ALTER COLUMN phone DROP NOT NULL;

UPDATE contacts
SET phone = NULL
WHERE phone IS NOT NULL AND btrim(phone) = '';

-- 3) Backfill BSUID from LID-shaped wa_id (Mercado Libre / privacy
--    chats stored CO.123… in wa_id by migration 048). Same token
--    Meta now documents as BSUID.
UPDATE contacts
SET bsuid = wa_id
WHERE (bsuid IS NULL OR bsuid = '')
  AND wa_id IS NOT NULL
  AND wa_id ~ '^[A-Za-z]{2}\.[A-Za-z0-9]{6,}$';

-- 4) Indexes. Partial uniques skip NULL/empty so several phone-less
--    contacts can coexist until a BSUID/wa_id is known.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_bsuid
  ON contacts (account_id, bsuid)
  WHERE bsuid IS NOT NULL AND bsuid <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_account_username
  ON contacts (account_id, username)
  WHERE username IS NOT NULL AND username <> '';

-- 5) Message audit — conversations already own contact_id; these
--    columns denormalize identity for debugging without becoming
--    the CRM join key.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_identifier TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_identifier_type TEXT;

COMMENT ON COLUMN messages.contact_id IS
  'Denormalized contacts.id for inbound/outbound audit. Source of truth for the thread remains conversations.contact_id.';

COMMENT ON COLUMN messages.sender_identifier IS
  'Raw WhatsApp sender token from the webhook (from, from_user_id, or wa_id).';

COMMENT ON COLUMN messages.sender_identifier_type IS
  'phone | bsuid | wa_id — which identifier was used as sender_identifier.';

CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);

UPDATE messages m
SET contact_id = conv.contact_id
FROM conversations conv
WHERE m.conversation_id = conv.id
  AND m.contact_id IS NULL;

-- 6) Contacts list RPC: search name / phone / email / username / bsuid.
CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR COALESCE(c.phone, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.email, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.username, '') ILIKE '%' || ltrim(p_search, '@') || '%'
        OR COALESCE(c.bsuid, '') ILIKE '%' || p_search || '%'
        OR COALESCE(c.wa_id, '') ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT) TO authenticated;
