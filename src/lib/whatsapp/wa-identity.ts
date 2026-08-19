/**
 * WhatsApp identity helpers for phone numbers, Linked IDs (LID), and
 * Business-scoped user IDs (BSUID).
 *
 * Cloud API webhooks may omit `messages[].from` / `contacts[].wa_id`
 * when the user hides their phone. The stable key is then
 * `contacts[].user_id` / `messages[].from_user_id` (BSUID, format
 * `CC.alphanumeric`). Username is profile metadata only.
 *
 * Mercado Libre / privacy chats historically arrived as LID tokens
 * (`CO.123…`) in `wa_id` or inside `wamid.*` — same shape as BSUID.
 */

import { isValidE164, normalizePhone, sanitizePhoneForMeta } from './phone-utils'

/** BSUID / LID token: two-letter country prefix + '.' + alphanumeric. */
const BSUID_RE = /^[A-Za-z]{2}\.[A-Za-z0-9]{6,128}$/

export function isBsuidToken(raw: string | null | undefined): boolean {
  if (!raw) return false
  return BSUID_RE.test(raw.trim())
}

/** Canonical BSUID (`US.1349…`, `CO.2717…`). Empty when not a BSUID. */
export function normalizeBsuid(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (isBsuidToken(trimmed)) return trimmed
  return ''
}

/** Username without leading @. Empty when missing. Never an identity key. */
export function normalizeUsername(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().replace(/^@+/, '')
}

/** Canonical form for a WhatsApp user id (phone digits or LID like `CO.123`). */
export function normalizeWaId(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  // username@lid → keep local part (Meta / bridge formats)
  const lidLocal = trimmed.match(/^([^@]+)@lid$/i)
  if (lidLocal) return lidLocal[1].trim()

  if (isBsuidToken(trimmed)) return trimmed

  const digits = normalizePhone(trimmed)
  if (digits && isValidE164(digits)) return digits

  // Non-E.164 digit blob from a LID (too long / not a phone) — keep digits
  if (digits.length >= 10) return digits

  // Last resort: preserve the raw token if it has no spaces
  if (/^\S+$/.test(trimmed) && trimmed.length >= 8) return trimmed
  return ''
}

/**
 * Pull a stable WhatsApp user id out of a Meta `wamid.*` string.
 * Decodes the base64 payload and looks for `CO.<digits>` first, then a
 * 10–15 digit phone-like sequence.
 */
export function extractWaIdFromWamid(
  wamid: string | null | undefined,
): string | null {
  if (!wamid || !wamid.startsWith('wamid.')) return null
  try {
    const b64 = wamid.slice('wamid.'.length)
    const text = Buffer.from(b64, 'base64').toString('latin1')
    const co = text.match(/[A-Za-z]{2}\.[A-Za-z0-9]{10,}/)
    if (co) return normalizeWaId(co[0])
    const phone = text.match(/(?<!\d)\d{10,15}(?!\d)/)
    if (phone) return normalizeWaId(phone[0])
  } catch {
    return null
  }
  return null
}

export type WhatsAppIdentifierType = 'bsuid' | 'wa_id' | 'phone' | 'unknown'

export interface InboundIdentity {
  /** Digits-only E.164-like phone, or '' when unavailable. */
  phone: string
  /** Stable WhatsApp id (phone, LID, or BSUID-shaped token). */
  waId: string | null
  /** Business-scoped user ID. Null when Meta did not send one. */
  bsuid: string | null
  /** Profile username without @. Null when absent. */
  username: string | null
  /** Which identifier we treat as the technical key for this event. */
  identifierType: WhatsAppIdentifierType
}

function e164From(raw: string | null | undefined): string {
  const norm = normalizeWaId(raw)
  return norm && isValidE164(norm) ? norm : ''
}

/**
 * Resolve phone + wa_id + BSUID + username for an inbound webhook.
 *
 * Phone is taken only from E.164 `from` / `wa_id`. BSUID comes from
 * `user_id` / `from_user_id`, or from a CC.* token in `from` / `wa_id`
 * / wamid. Username is never used as the stable key.
 */
export function resolveInboundIdentity(input: {
  from?: string | null
  waId?: string | null
  userId?: string | null
  fromUserId?: string | null
  username?: string | null
  messageId?: string | null
}): InboundIdentity {
  const fromNorm = normalizeWaId(input.from)
  const contactWa = normalizeWaId(input.waId)
  const fromWamid = extractWaIdFromWamid(input.messageId ?? null)

  const phoneCandidate =
    e164From(input.from) || e164From(input.waId) || ''

  const bsuid =
    normalizeBsuid(input.userId) ||
    normalizeBsuid(input.fromUserId) ||
    (isBsuidToken(fromNorm) ? fromNorm : '') ||
    (isBsuidToken(contactWa) ? contactWa : '') ||
    (fromWamid && isBsuidToken(fromWamid) ? fromWamid : '') ||
    ''

  const waId =
    contactWa ||
    fromNorm ||
    fromWamid ||
    (phoneCandidate ? phoneCandidate : null) ||
    (bsuid ? bsuid : null)

  const username = normalizeUsername(input.username) || null

  let identifierType: WhatsAppIdentifierType = 'unknown'
  if (bsuid) identifierType = 'bsuid'
  else if (phoneCandidate) identifierType = 'phone'
  else if (waId) identifierType = 'wa_id'

  return {
    phone: phoneCandidate,
    waId: waId || null,
    bsuid: bsuid || null,
    username,
    identifierType,
  }
}

export type WhatsAppRecipient =
  | { type: 'phone'; value: string }
  | { type: 'bsuid'; value: string }

/**
 * Recipient for Meta Cloud API.
 * Prefers a valid phone (`to`); falls back to BSUID / LID (`recipient`).
 * Never uses username — Meta does not accept @username as a destination.
 */
export function resolveWhatsAppRecipient(contact: {
  phone?: string | null
  wa_id?: string | null
  bsuid?: string | null
}): WhatsAppRecipient | null {
  const phone = sanitizePhoneForMeta(contact.phone ?? '')
  if (phone && isValidE164(phone)) return { type: 'phone', value: phone }

  const bsuid = normalizeBsuid(contact.bsuid)
  if (bsuid) return { type: 'bsuid', value: bsuid }

  const wa = normalizeWaId(contact.wa_id)
  if (wa && isBsuidToken(wa)) return { type: 'bsuid', value: wa }
  if (wa && isValidE164(wa)) return { type: 'phone', value: wa }

  // Last resort: non-E.164 digits stored in phone (legacy LID-as-phone)
  if (phone && phone.length >= 10) return { type: 'phone', value: phone }
  return null
}

/**
 * Recipient string for Meta Cloud API. Prefer {@link resolveWhatsAppRecipient}
 * so callers can put phones in `to` and BSUIDs in `recipient`.
 */
export function resolveOutboundRecipient(contact: {
  phone?: string | null
  wa_id?: string | null
  bsuid?: string | null
}): string | null {
  return resolveWhatsAppRecipient(contact)?.value ?? null
}

/** True when the recipient is a real phone (variant retry is useful). */
export function isPhoneRecipient(to: string): boolean {
  return isValidE164(sanitizePhoneForMeta(to))
}
