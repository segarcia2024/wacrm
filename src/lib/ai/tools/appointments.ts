import {
  APPOINTMENT_TYPES,
  DEFAULT_DURATION_MINUTES,
} from '@/lib/appointments/helpers'
import type { AppointmentType } from '@/types'
import {
  formatBogotaLabel,
  parseAppointmentDateTime,
  rangesOverlap,
  slotWindowError,
} from './datetime'
import type { ToolContext } from './types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TYPE_LABEL: Record<string, string> = {
  showroom: 'visita al showroom',
  test_drive: 'test drive',
  call: 'llamada',
  delivery: 'entrega',
  other: 'cita',
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v.trim() : ''
}

function int(args: Record<string, unknown>, key: string): number | null {
  const v = args[key]
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) {
    return Number.parseInt(v.trim(), 10)
  }
  return null
}

function parseType(raw: string): AppointmentType {
  return (APPOINTMENT_TYPES as string[]).includes(raw)
    ? (raw as AppointmentType)
    : 'showroom'
}

function clampDuration(raw: number | null): number {
  const n = raw ?? DEFAULT_DURATION_MINUTES
  return Math.min(240, Math.max(15, n))
}

function missingCustomer(): string {
  return json({
    ok: false,
    error: 'no_customer',
    message:
      'No customer is linked to this conversation, so an appointment cannot be booked here.',
  })
}

interface ExistingAppt {
  id: string
  starts_at: string
  duration_minutes: number
  type: string
  status: string
}

async function loadScheduled(
  ctx: ToolContext,
  contactId: string,
): Promise<{ rows: ExistingAppt[]; error: string | null }> {
  const { data, error } = await ctx.db
    .from('appointments')
    .select('id, starts_at, duration_minutes, type, status')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .order('starts_at', { ascending: true })
    .limit(50)

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as ExistingAppt[], error: null }
}

function findOverlap(
  rows: ExistingAppt[],
  startsAt: Date,
  durationMinutes: number,
): ExistingAppt | null {
  return (
    rows.find((row) => {
      const existing = new Date(row.starts_at)
      if (Number.isNaN(existing.getTime())) return false
      return rangesOverlap(existing, row.duration_minutes, startsAt, durationMinutes)
    }) ?? null
  )
}

function presentAppt(row: ExistingAppt) {
  const starts = new Date(row.starts_at)
  return {
    appointment_id: row.id,
    type: row.type,
    type_label: TYPE_LABEL[row.type] ?? row.type,
    starts_at: row.starts_at,
    starts_at_label: Number.isNaN(starts.getTime()) ? row.starts_at : formatBogotaLabel(starts),
    duration_minutes: row.duration_minutes,
    status: row.status,
  }
}

export async function checkAppointmentSlot(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const contactId = ctx.contactId
  if (!contactId) return missingCustomer()

  const startsAt = parseAppointmentDateTime(str(args, 'starts_at'))
  if (!startsAt) {
    return json({
      ok: false,
      error: 'invalid_datetime',
      message:
        'Could not parse starts_at. Use "YYYY-MM-DD HH:mm" in America/Bogota, e.g. "2026-09-05 15:00".',
    })
  }

  const durationMinutes = clampDuration(int(args, 'duration_minutes'))
  const now = ctx.now ?? new Date()
  const windowErr = slotWindowError(startsAt, now)
  if (windowErr) {
    return json({
      ok: true,
      available: false,
      reason: windowErr,
      starts_at_label: formatBogotaLabel(startsAt),
    })
  }

  const { rows, error } = await loadScheduled(ctx, contactId)
  if (error) {
    return json({ ok: false, error: 'lookup_failed', message: error })
  }

  const clash = findOverlap(rows, startsAt, durationMinutes)
  if (clash) {
    return json({
      ok: true,
      available: false,
      reason: 'This customer already has a scheduled appointment that overlaps that time.',
      starts_at_label: formatBogotaLabel(startsAt),
      overlapping: presentAppt(clash),
    })
  }

  return json({
    ok: true,
    available: true,
    starts_at: startsAt.toISOString(),
    starts_at_label: formatBogotaLabel(startsAt),
    duration_minutes: durationMinutes,
    timezone: 'America/Bogota',
  })
}

export async function listContactAppointments(
  ctx: ToolContext,
  _args: Record<string, unknown>,
): Promise<string> {
  const contactId = ctx.contactId
  if (!contactId) return missingCustomer()

  const now = ctx.now ?? new Date()
  const { data, error } = await ctx.db
    .from('appointments')
    .select('id, starts_at, duration_minutes, type, status, location')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .order('starts_at', { ascending: true })
    .limit(10)

  if (error) {
    return json({ ok: false, error: 'lookup_failed', message: error.message })
  }

  const appointments = ((data ?? []) as ExistingAppt[]).map(presentAppt)
  return json({
    ok: true,
    count: appointments.length,
    appointments,
    timezone: 'America/Bogota',
  })
}

export async function createAppointment(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  if (!ctx.allowWrites) {
    return json({
      ok: false,
      error: 'writes_disabled',
      message:
        'Booking is only allowed in a live WhatsApp auto-reply. Do not tell the customer it is booked. Offer to confirm with an advisor, or keep chatting on WhatsApp.',
    })
  }

  const contactId = ctx.contactId
  if (!contactId) return missingCustomer()
  if (!ctx.actorUserId) {
    return json({
      ok: false,
      error: 'no_actor',
      message: 'Cannot book without an account user to attribute the appointment to.',
    })
  }

  const startsAt = parseAppointmentDateTime(str(args, 'starts_at'))
  if (!startsAt) {
    return json({
      ok: false,
      error: 'invalid_datetime',
      message:
        'Could not parse starts_at. Use "YYYY-MM-DD HH:mm" in America/Bogota, e.g. "2026-09-05 15:00".',
    })
  }

  const durationMinutes = clampDuration(int(args, 'duration_minutes'))
  const type = parseType(str(args, 'type'))
  const now = ctx.now ?? new Date()
  const windowErr = slotWindowError(startsAt, now)
  if (windowErr) {
    return json({ ok: false, error: 'slot_unavailable', message: windowErr })
  }

  const { rows, error: loadErr } = await loadScheduled(ctx, contactId)
  if (loadErr) {
    return json({ ok: false, error: 'lookup_failed', message: loadErr })
  }
  const clash = findOverlap(rows, startsAt, durationMinutes)
  if (clash) {
    return json({
      ok: false,
      error: 'slot_unavailable',
      message: 'This customer already has a scheduled appointment that overlaps that time.',
      overlapping: presentAppt(clash),
    })
  }

  const location = str(args, 'location').slice(0, 200) || null
  const vehicleId = str(args, 'vehicle_id')
  const noteBits: string[] = ['Agendada por IA desde WhatsApp.']
  const extraNotes = str(args, 'notes').slice(0, 500)
  if (extraNotes) noteBits.push(extraNotes)
  if (vehicleId && UUID_RE.test(vehicleId)) {
    noteBits.push(`vehicle_id=${vehicleId}`)
  }

  const payload = {
    account_id: ctx.accountId,
    user_id: ctx.actorUserId,
    contact_id: contactId,
    conversation_id: ctx.conversationId || null,
    assigned_to: ctx.defaultAssigneeId || null,
    type,
    starts_at: startsAt.toISOString(),
    duration_minutes: durationMinutes,
    location,
    notes: noteBits.join(' '),
    reminder_enabled: true,
    status: 'scheduled',
  }

  const { data, error } = await ctx.db
    .from('appointments')
    .insert(payload)
    .select('id, starts_at, duration_minutes, type, status, location')
    .single()

  if (error || !data) {
    return json({
      ok: false,
      error: 'insert_failed',
      message: error?.message ?? 'Could not create the appointment.',
    })
  }

  const created = data as ExistingAppt & { location?: string | null }
  return json({
    ok: true,
    booked: true,
    appointment: {
      ...presentAppt(created),
      location: created.location ?? location,
    },
    message:
      'Appointment saved on the Revio agenda. Confirm the date, time, and type to the customer. Do not invent extra details.',
  })
}
