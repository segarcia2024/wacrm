import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, phonesMatch } from "@/lib/whatsapp/phone-utils";
import {
  normalizeBsuid,
  normalizeUsername,
  normalizeWaId,
  type InboundIdentity,
} from "@/lib/whatsapp/wa-identity";

/**
 * Contact de-duplication helpers, shared by the WhatsApp webhook, the
 * manual contact form, and CSV import so all paths agree on what
 * "same number" means (issue #212).
 *
 * Internal identity is always `contacts.id`.
 * WhatsApp lookup order (webhook):
 *   1. bsuid (contacts[].user_id)
 *   2. wa_id
 *   3. phone
 * Username is profile metadata and is never a lookup key.
 */

/** Canonical de-dup key for a phone string (digits only). */
export function normalizeKey(phone: string): string {
  return normalizePhone(phone);
}

/** Minimal shape we need back from a contacts lookup. */
export interface ExistingContact {
  id: string;
  phone: string | null;
  wa_id?: string | null;
  bsuid?: string | null;
  username?: string | null;
  name?: string | null;
  [key: string]: unknown;
}

/**
 * Find an existing contact in `accountId` whose phone matches `phone`,
 * or null. Pre-filters in SQL by the last-8-digit suffix (so we don't
 * pull every contact), then applies the strict `phonesMatch` in JS on
 * the small candidate set — the exact approach the webhook has used.
 */
export async function findExistingContact(
  db: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<ExistingContact | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .like("phone", `%${suffix}`);

  if (error || !data) return null;

  return (
    (data as ExistingContact[]).find((c) =>
      phonesMatch(c.phone ?? "", phone),
    ) ?? null
  );
}

/**
 * Find a contact by stable WhatsApp id (E.164 or LID like `CO.123…`).
 */
export async function findExistingContactByWaId(
  db: SupabaseClient,
  accountId: string,
  waId: string,
): Promise<ExistingContact | null> {
  const key = normalizeWaId(waId);
  if (!key) return null;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("wa_id", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExistingContact;
}

export async function findExistingContactByBsuid(
  db: SupabaseClient,
  accountId: string,
  bsuid: string,
): Promise<ExistingContact | null> {
  const key = normalizeBsuid(bsuid);
  if (!key) return null;

  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("bsuid", key)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExistingContact;
}

/**
 * Resolve an existing contact: BSUID → wa_id → phone.
 * Used by the inbound WhatsApp webhook so LID/BSUID-only leads thread
 * into one conversation, and a later phone share updates the same row.
 */
export async function findExistingContactByIdentity(
  db: SupabaseClient,
  accountId: string,
  phone: string,
  waId: string | null | undefined,
  bsuid?: string | null,
): Promise<ExistingContact | null> {
  if (bsuid) {
    const byBsuid = await findExistingContactByBsuid(db, accountId, bsuid);
    if (byBsuid) return byBsuid;
  }
  if (waId) {
    const byWa = await findExistingContactByWaId(db, accountId, waId);
    if (byWa) return byWa;
  }
  if (phone) {
    return findExistingContact(db, accountId, phone);
  }
  return null;
}

export interface UpsertWhatsAppContactInput {
  accountId: string;
  ownerUserId: string;
  identity: InboundIdentity;
  name: string;
}

export interface UpsertWhatsAppContactResult {
  contact: ExistingContact;
  wasCreated: boolean;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t ? t : null;
}

/**
 * Find or create the WhatsApp contact for an inbound identity, then
 * fill in newly discovered metadata (phone, bsuid, username) on the
 * same row. Never creates a second contact when a later webhook
 * reveals a phone for an existing BSUID.
 */
export async function upsertWhatsAppContact(
  db: SupabaseClient,
  input: UpsertWhatsAppContactInput,
): Promise<UpsertWhatsAppContactResult | null> {
  const { accountId, ownerUserId, identity, name } = input;
  const phone = identity.phone || "";
  const waId = identity.waId;
  const bsuid = identity.bsuid;
  const username = normalizeUsername(identity.username);

  if (!phone && !waId && !bsuid) return null;

  const existing = await findExistingContactByIdentity(
    db,
    accountId,
    phone,
    waId,
    bsuid,
  );

  if (existing) {
    const patch: Record<string, string | null> = {};
    if (name && name !== existing.name) patch.name = name;
    if (phone && !blankToNull(existing.phone)) patch.phone = phone;
    const existingWa = normalizeWaId(
      typeof existing.wa_id === "string" ? existing.wa_id : "",
    );
    if (waId && !existingWa) patch.wa_id = waId;
    const existingBsuid = normalizeBsuid(
      typeof existing.bsuid === "string" ? existing.bsuid : "",
    );
    if (bsuid && !existingBsuid) patch.bsuid = bsuid;
    if (username && username !== (existing.username ?? "")) {
      patch.username = username;
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { error } = await db
        .from("contacts")
        .update(patch)
        .eq("id", existing.id);
      if (error) {
        if (isUniqueViolation(error)) {
          console.warn(
            "[contacts] identity patch hit unique constraint; keeping existing row",
            { contact_id: existing.id, has_phone: Boolean(phone), has_bsuid: Boolean(bsuid) },
          );
        } else {
          console.error("[contacts] identity patch failed:", error.message);
        }
      } else {
        Object.assign(existing, patch);
      }
    }
    return { contact: existing, wasCreated: false };
  }

  const insertName = name || username || phone || waId || bsuid || "Unknown";
  const { data: newContact, error: createError } = await db
    .from("contacts")
    .insert({
      account_id: accountId,
      user_id: ownerUserId,
      phone: phone || null,
      wa_id: waId,
      bsuid: bsuid,
      username: username || null,
      name: insertName,
    })
    .select()
    .single();

  if (createError) {
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContactByIdentity(
        db,
        accountId,
        phone,
        waId,
        bsuid,
      );
      if (raced) return { contact: raced, wasCreated: false };
    }
    console.error("Error creating contact:", createError);
    return null;
  }

  return { contact: newContact as ExistingContact, wasCreated: true };
}

/**
 * True when an existing contact is an *exact* normalized match for
 * `phone` (vs only a fuzzy trunk-variant match). The form hard-blocks
 * exact matches but only warns on fuzzy ones.
 */
export function isExactMatch(existing: ExistingContact, phone: string): boolean {
  return normalizeKey(existing.phone ?? "") === normalizeKey(phone);
}

/**
 * True for a Postgres unique-constraint violation (SQLSTATE 23505).
 * Used as the backstop when the DB unique index rejects a racing or
 * format-equal insert that slipped past the in-app check.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}

/**
 * De-duplicate parsed CSV rows by normalized phone, keeping the first
 * occurrence of each. Rows with an empty normalized phone are dropped
 * (they can't be a valid contact). Returns the unique rows plus the
 * count removed as in-file duplicates.
 */
export function dedupeByPhone<T extends { phone: string }>(
  rows: T[],
): { unique: T[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const key = normalizeKey(row.phone);
    if (!key) {
      duplicates++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}
