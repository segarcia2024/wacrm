import { describe, expect, it } from 'vitest'
import {
  formatBogotaLabel,
  parseAppointmentDateTime,
  rangesOverlap,
  slotWindowError,
} from './datetime'

describe('parseAppointmentDateTime', () => {
  it('interprets naive local time as America/Bogota (UTC-5)', () => {
    const d = parseAppointmentDateTime('2026-09-05 15:00')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe('2026-09-05T20:00:00.000Z')
  })

  it('accepts ISO with timezone', () => {
    const d = parseAppointmentDateTime('2026-09-05T15:00:00-05:00')
    expect(d!.toISOString()).toBe('2026-09-05T20:00:00.000Z')
  })

  it('returns null for date-only or garbage', () => {
    expect(parseAppointmentDateTime('2026-09-05')).toBeNull()
    expect(parseAppointmentDateTime('mañana a las 3')).toBeNull()
    expect(parseAppointmentDateTime('')).toBeNull()
  })
})

describe('slotWindowError', () => {
  const now = new Date('2026-09-03T17:00:00.000Z')

  it('rejects times in the past / too soon', () => {
    const past = parseAppointmentDateTime('2026-09-03 08:00')!
    expect(slotWindowError(past, now)).toMatch(/past|15 minutes/i)
  })

  it('accepts a slot later today', () => {
    const later = parseAppointmentDateTime('2026-09-03 15:00')! // 20:00Z
    expect(slotWindowError(later, now)).toBeNull()
  })
})

describe('rangesOverlap', () => {
  const a = new Date('2026-09-05T20:00:00.000Z')
  it('detects overlap', () => {
    const b = new Date('2026-09-05T20:30:00.000Z')
    expect(rangesOverlap(a, 60, b, 60)).toBe(true)
  })
  it('allows back-to-back slots', () => {
    const b = new Date('2026-09-05T21:00:00.000Z')
    expect(rangesOverlap(a, 60, b, 60)).toBe(false)
  })
})

describe('formatBogotaLabel', () => {
  it('formats in Spanish / Bogota', () => {
    const label = formatBogotaLabel(new Date('2026-09-05T20:00:00.000Z'))
    expect(label.toLowerCase()).toContain('septiembre')
    expect(label).toMatch(/3/)
  })
})
