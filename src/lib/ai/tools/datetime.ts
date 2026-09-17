/** Dealership local zone. America/Bogota is UTC-5 year-round (no DST). */
export const BUSINESS_TIMEZONE = 'America/Bogota'
const BOGOTA_OFFSET = '-05:00'

export const MIN_LEAD_MS = 15 * 60 * 1000
export const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Parse a customer-facing datetime into a UTC Date.
 *
 * Accepts ISO-8601 with a timezone (`Z` or ±HH:MM), or a naive
 * `YYYY-MM-DD HH:mm` / `YYYY-MM-DDTHH:mm` interpreted as America/Bogota.
 */
export function parseAppointmentDateTime(raw: string): Date | null {
  const s = String(raw ?? '').trim()
  if (!s) return null

  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const iso = `${m[1]}T${m[2]}:${m[3] ?? '00'}${BOGOTA_OFFSET}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatBogotaLabel(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatNowBogota(now = new Date()): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export function rangesOverlap(
  aStart: Date,
  aMinutes: number,
  bStart: Date,
  bMinutes: number,
): boolean {
  const aEnd = aStart.getTime() + aMinutes * 60_000
  const bEnd = bStart.getTime() + bMinutes * 60_000
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd
}

export function slotWindowError(
  startsAt: Date,
  now: Date,
): string | null {
  const lead = startsAt.getTime() - now.getTime()
  if (lead < MIN_LEAD_MS) {
    return 'The requested time is in the past or less than 15 minutes from now. Pick a later slot.'
  }
  if (lead > MAX_AHEAD_MS) {
    return 'Appointments can only be booked up to 90 days ahead.'
  }
  return null
}
