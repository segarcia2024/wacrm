/**
 * Safe contact labels for inbox / CRM. Never returns "undefined" / "null".
 *
 * Visual priority: display name → @username → phone → abbreviated BSUID.
 */

export type ContactDisplayFields = {
  name?: string | null
  phone?: string | null
  username?: string | null
  bsuid?: string | null
  wa_id?: string | null
}

function trim(value: string | null | undefined): string {
  if (value == null) return ''
  const t = String(value).trim()
  if (!t || t === 'undefined' || t === 'null') return ''
  return t
}

export function visiblePhone(phone?: string | null): string {
  return trim(phone)
}

export function formatWhatsAppUsername(username?: string | null): string {
  const u = trim(username).replace(/^@+/, '')
  return u ? `@${u}` : ''
}

export function abbreviateBsuid(bsuid?: string | null): string {
  const b = trim(bsuid)
  if (!b) return ''
  if (b.length <= 14) return b
  return `${b.slice(0, 6)}…${b.slice(-4)}`
}

/** Title line: name, else @username, else phone, else short BSUID. */
export function contactPrimaryLabel(
  contact: ContactDisplayFields | null | undefined,
  fallback = 'Unknown',
): string {
  if (!contact) return fallback
  const name = trim(contact.name)
  if (name) return name
  const username = formatWhatsAppUsername(contact.username)
  if (username) return username
  const phone = visiblePhone(contact.phone)
  if (phone) return phone
  const bsuid = abbreviateBsuid(contact.bsuid) || abbreviateBsuid(contact.wa_id)
  if (bsuid) return bsuid
  const wa = trim(contact.wa_id)
  if (wa) return wa
  return fallback
}

/**
 * Secondary line under the name.
 * If the title is a name: username, else phone, else nothing
 * (never repeat the title, never show empty/undefined).
 */
export function contactSecondaryLabel(
  contact: ContactDisplayFields | null | undefined,
): string {
  if (!contact) return ''
  const name = trim(contact.name)
  const username = formatWhatsAppUsername(contact.username)
  const phone = visiblePhone(contact.phone)
  if (name) {
    if (username) return username
    if (phone) return phone
    const bsuid = abbreviateBsuid(contact.bsuid)
    return bsuid
  }
  if (username && phone) return phone
  return ''
}
