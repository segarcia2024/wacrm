-- ============================================================
-- 048_contact_wa_id_dedup
--
-- Mercado Libre → WhatsApp inquiries often arrive without an E.164
-- phone (`messages[].from` empty / non-phone LID). The CRM keyed
-- contacts only on phone, and the unique index on phone_normalized
-- excludes empty values — so every inbound message created a new
-- contact + conversation with phone='' (duplicate wall, can't reply).
--
-- Fix:
--   1. add contacts.wa_id (stable WhatsApp user id / LID);
--   2. backfill from phone_normalized and from wamid payloads;
--   3. merge contacts that share the same wa_id (folding conversations
--      first so UNIQUE(account_id, contact_id) is respected);
--   4. UNIQUE (account_id, wa_id) WHERE wa_id <> ''.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS wa_id TEXT;

COMMENT ON COLUMN contacts.wa_id IS
  'Stable WhatsApp user id (E.164 digits or LID like CO.123…). Used for dedupe when phone is missing.';

-- 1) Contacts that already have a phone: wa_id defaults to that phone.
UPDATE contacts
SET wa_id = phone_normalized
WHERE (wa_id IS NULL OR wa_id = '')
  AND phone_normalized IS NOT NULL
  AND phone_normalized <> '';

-- 2) Empty-phone contacts: extract CO.<digits> (or a phone) from the
--    first customer wamid on their conversation.
UPDATE contacts c
SET wa_id = sub.extracted
FROM (
  SELECT DISTINCT ON (cv.contact_id)
    cv.contact_id,
    COALESCE(
      (regexp_match(
        encode(decode(split_part(m.message_id, '.', 2), 'base64'), 'escape'),
        '[A-Za-z]{2}\.[0-9]{10,}'
      ))[1],
      (regexp_match(
        encode(decode(split_part(m.message_id, '.', 2), 'base64'), 'escape'),
        '[0-9]{10,15}'
      ))[1]
    ) AS extracted
  FROM conversations cv
  JOIN messages m ON m.conversation_id = cv.id
  WHERE m.message_id LIKE 'wamid.%'
    AND m.sender_type = 'customer'
  ORDER BY cv.contact_id, m.created_at ASC, m.id ASC
) sub
WHERE c.id = sub.contact_id
  AND (c.wa_id IS NULL OR c.wa_id = '')
  AND sub.extracted IS NOT NULL
  AND sub.extracted <> '';

-- 3) Merge contacts that share (account_id, wa_id), folding child rows
--    onto the oldest survivor. Conversations are merged explicitly
--    because UNIQUE(account_id, contact_id) forbids a naive re-point.
CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts_by_wa_id()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group          RECORD;
  v_survivor       UUID;
  v_losers         UUID[];
  v_merged         INTEGER := 0;
  v_surv_conv      UUID;
  v_loser_conv     UUID;
BEGIN
  FOR v_group IN
    SELECT account_id,
           wa_id,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids
    FROM contacts
    WHERE wa_id IS NOT NULL AND wa_id <> ''
    GROUP BY account_id, wa_id
    HAVING count(*) > 1
  LOOP
    v_survivor := v_group.ids[1];
    v_losers   := v_group.ids[2:array_length(v_group.ids, 1)];

    -- Survivor conversation (oldest if somehow multiple).
    SELECT id INTO v_surv_conv
    FROM conversations
    WHERE account_id = v_group.account_id
      AND contact_id = v_survivor
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Fold each loser's conversation(s) into the survivor thread.
    FOR v_loser_conv IN
      SELECT c.id
      FROM conversations c
      WHERE c.contact_id = ANY(v_losers)
      ORDER BY c.created_at ASC, c.id ASC
    LOOP
      IF v_surv_conv IS NULL THEN
        UPDATE conversations
        SET contact_id = v_survivor,
            updated_at = NOW()
        WHERE id = v_loser_conv;
        v_surv_conv := v_loser_conv;
      ELSIF v_loser_conv <> v_surv_conv THEN
        UPDATE messages          SET conversation_id = v_surv_conv WHERE conversation_id = v_loser_conv;
        UPDATE message_reactions SET conversation_id = v_surv_conv WHERE conversation_id = v_loser_conv;
        UPDATE deals             SET conversation_id = v_surv_conv WHERE conversation_id = v_loser_conv;
        UPDATE flow_runs         SET conversation_id = v_surv_conv WHERE conversation_id = v_loser_conv;
        UPDATE notifications     SET conversation_id = v_surv_conv WHERE conversation_id = v_loser_conv;
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'ai_usage_log'
        ) THEN
          EXECUTE 'UPDATE ai_usage_log SET conversation_id = $1 WHERE conversation_id = $2'
            USING v_surv_conv, v_loser_conv;
        END IF;

        DELETE FROM conversations WHERE id = v_loser_conv;
      END IF;
    END LOOP;

    -- Refresh survivor last-message after fold.
    IF v_surv_conv IS NOT NULL THEN
      UPDATE conversations c
      SET last_message_text = lm.content_text,
          last_message_at   = lm.created_at,
          updated_at        = NOW()
      FROM (
        SELECT content_text, created_at
        FROM messages
        WHERE conversation_id = v_surv_conv
        ORDER BY created_at DESC
        LIMIT 1
      ) lm
      WHERE c.id = v_surv_conv;
    END IF;

    -- Re-point remaining contact-scoped children.
    UPDATE contact_notes                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE deals                         SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE broadcast_recipients          SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_logs               SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE automation_pending_executions SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);
    UPDATE notifications                 SET contact_id = v_survivor WHERE contact_id = ANY(v_losers);

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'appointments'
    ) THEN
      EXECUTE 'UPDATE appointments SET contact_id = $1 WHERE contact_id = ANY($2::uuid[])'
        USING v_survivor, v_losers;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicles'
        AND column_name = 'buyer_contact_id'
    ) THEN
      EXECUTE 'UPDATE vehicles SET buyer_contact_id = $1 WHERE buyer_contact_id = ANY($2::uuid[])'
        USING v_survivor, v_losers;
    END IF;

    UPDATE contact_tags ct SET contact_id = v_survivor
      WHERE ct.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_tags s
          WHERE s.contact_id = v_survivor AND s.tag_id = ct.tag_id
        );
    DELETE FROM contact_tags WHERE contact_id = ANY(v_losers);

    UPDATE contact_custom_values cv SET contact_id = v_survivor
      WHERE cv.contact_id = ANY(v_losers)
        AND NOT EXISTS (
          SELECT 1 FROM contact_custom_values s
          WHERE s.contact_id = v_survivor AND s.custom_field_id = cv.custom_field_id
        );
    DELETE FROM contact_custom_values WHERE contact_id = ANY(v_losers);

    UPDATE flow_runs SET contact_id = v_survivor
      WHERE contact_id = ANY(v_losers) AND status <> 'active';

    -- Prefer a real phone on the survivor if a loser had one.
    UPDATE contacts AS surv
    SET phone = COALESCE(NULLIF(surv.phone, ''), donor.phone),
        name  = CASE
                  WHEN surv.name IS NULL OR surv.name = '' OR surv.name = surv.phone
                  THEN COALESCE(NULLIF(donor.name, ''), surv.name)
                  ELSE surv.name
                END,
        updated_at = NOW()
    FROM (
      SELECT phone, name
      FROM contacts
      WHERE id = ANY(v_losers)
        AND phone IS NOT NULL AND phone <> ''
      ORDER BY created_at ASC
      LIMIT 1
    ) donor
    WHERE surv.id = v_survivor
      AND (surv.phone IS NULL OR surv.phone = '');

    DELETE FROM contacts WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_contacts_by_wa_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_contacts_by_wa_id() FROM PUBLIC;

SELECT public.merge_duplicate_contacts_by_wa_id();

-- Also collapse any conversation duplicates that the fold may have left
-- (belt-and-braces if merge_duplicate_conversations exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_duplicate_conversations'
  ) THEN
    PERFORM public.merge_duplicate_conversations();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_wa_id
  ON contacts (account_id, wa_id)
  WHERE wa_id IS NOT NULL AND wa_id <> '';
