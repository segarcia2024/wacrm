import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkAppointmentSlot,
  createAppointment,
  listContactAppointments,
} from './appointments'
import type { ToolContext } from './types'

const NOW = new Date('2026-09-03T17:00:00.000Z')
const SLOT = '2026-09-05 15:00'
const UUID = '22222222-2222-4222-8222-222222222222'

function thenable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = new Proxy(builder, {
    get(_t, prop) {
      if (prop === 'then') {
        return (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject)
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve(result)
      }
      return () => self
    },
  })
  return self
}

function makeCtx(overrides: Partial<ToolContext> & { db: unknown }): ToolContext {
  return {
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    actorUserId: 'user-1',
    allowWrites: true,
    now: NOW,
    ...overrides,
    db: overrides.db as SupabaseClient,
  }
}

describe('checkAppointmentSlot', () => {
  it('marks a free future slot available', async () => {
    const result = JSON.parse(
      await checkAppointmentSlot(
        makeCtx({ db: { from: () => thenable({ data: [], error: null }) } }),
        { starts_at: SLOT },
      ),
    )
    expect(result.ok).toBe(true)
    expect(result.available).toBe(true)
    expect(result.starts_at).toBe('2026-09-05T20:00:00.000Z')
  })

  it('detects an overlapping scheduled visit', async () => {
    const result = JSON.parse(
      await checkAppointmentSlot(
        makeCtx({
          db: {
            from: () =>
              thenable({
                data: [
                  {
                    id: UUID,
                    starts_at: '2026-09-05T20:00:00.000Z',
                    duration_minutes: 60,
                    type: 'showroom',
                    status: 'scheduled',
                  },
                ],
                error: null,
              }),
          },
        }),
        { starts_at: '2026-09-05 15:30' },
      ),
    )
    expect(result.available).toBe(false)
    expect(result.overlapping.appointment_id).toBe(UUID)
  })
})

describe('createAppointment', () => {
  it('refuses writes when allowWrites is false', async () => {
    const from = vi.fn()
    const result = JSON.parse(
      await createAppointment(
        makeCtx({ db: { from }, allowWrites: false }),
        { starts_at: SLOT },
      ),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('writes_disabled')
    expect(from).not.toHaveBeenCalled()
  })

  it('inserts a scheduled row on the account agenda', async () => {
    const existing = thenable({ data: [], error: null })
    let inserted: Record<string, unknown> | null = null
    const from = vi.fn((table: string) => {
      if (table === 'appointments') {
        return {
          select: () => existing,
          insert: (payload: Record<string, unknown>) => {
            inserted = payload
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: UUID,
                      starts_at: payload.starts_at,
                      duration_minutes: payload.duration_minutes,
                      type: payload.type,
                      status: 'scheduled',
                      location: payload.location,
                    },
                    error: null,
                  }),
              }),
            }
          },
        }
      }
      return existing
    })

    const result = JSON.parse(
      await createAppointment(makeCtx({ db: { from } }), {
        starts_at: SLOT,
        type: 'test_drive',
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.booked).toBe(true)
    expect(result.appointment.appointment_id).toBe(UUID)
    expect(inserted).toMatchObject({
      account_id: 'acct-1',
      contact_id: 'contact-1',
      conversation_id: 'conv-1',
      user_id: 'user-1',
      type: 'test_drive',
      status: 'scheduled',
      reminder_enabled: true,
      starts_at: '2026-09-05T20:00:00.000Z',
    })
    expect(String(inserted?.notes)).toContain('Agendada por IA')
  })

  it('does not insert when the slot overlaps', async () => {
    let inserted = false
    const from = vi.fn(() => ({
      select: () =>
        thenable({
          data: [
            {
              id: UUID,
              starts_at: '2026-09-05T20:00:00.000Z',
              duration_minutes: 60,
              type: 'showroom',
              status: 'scheduled',
            },
          ],
          error: null,
        }),
      insert: () => {
        inserted = true
        return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }
      },
    }))
    const result = JSON.parse(
      await createAppointment(makeCtx({ db: { from } }), { starts_at: SLOT }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('slot_unavailable')
    expect(inserted).toBe(false)
  })
})

describe('listContactAppointments', () => {
  it('requires a customer', async () => {
    const result = JSON.parse(
      await listContactAppointments(
        makeCtx({ db: { from: vi.fn() }, contactId: null }),
        {},
      ),
    )
    expect(result.error).toBe('no_customer')
  })
})
