import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeSearchToken, searchVehicles, getVehicle } from './vehicles'
import type { ToolContext } from './types'

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

function ctx(db: unknown): ToolContext {
  return {
    db: db as SupabaseClient,
    accountId: 'acct-1',
    allowWrites: false,
  }
}

const MAZDA = {
  id: '11111111-1111-4111-8111-111111111111',
  plate: 'ABC123',
  make: 'MAZDA',
  model: '3',
  year: 2018,
  price: 45_000_000,
  mileage: 42000,
  status: 'available',
  notes: null,
}

describe('sanitizeSearchToken', () => {
  it('strips PostgREST metacharacters', () => {
    expect(sanitizeSearchToken('mazda,3%_')).toBe('mazda 3')
  })
})

describe('searchVehicles', () => {
  it('returns formatted COP prices and available stock', async () => {
    const from = vi.fn(() => thenable({ data: [MAZDA], error: null }))
    const result = JSON.parse(
      await searchVehicles(ctx({ from }), { query: 'mazda' }),
    )
    expect(from).toHaveBeenCalledWith('vehicles')
    expect(result.ok).toBe(true)
    expect(result.count).toBe(1)
    expect(result.vehicles[0].price_cop).toBe(45_000_000)
    expect(result.vehicles[0].price_label).toMatch(/45/)
    expect(result.vehicles[0].status_label).toBe('disponible')
  })

  it('returns an empty list without inventing cars', async () => {
    const result = JSON.parse(
      await searchVehicles(ctx({ from: () => thenable({ data: [], error: null }) }), {
        query: 'ferrari',
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.count).toBe(0)
    expect(result.vehicles).toEqual([])
  })
})

describe('getVehicle', () => {
  it('rejects a non-uuid id without hitting a weird filter', async () => {
    const from = vi.fn()
    const result = JSON.parse(await getVehicle(ctx({ from }), { vehicle_id: 'nope' }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid_vehicle_id')
    expect(from).not.toHaveBeenCalled()
  })

  it('returns not_found when the row is missing', async () => {
    const result = JSON.parse(
      await getVehicle(
        ctx({ from: () => thenable({ data: null, error: null }) }),
        { vehicle_id: MAZDA.id },
      ),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not_found')
  })
})
