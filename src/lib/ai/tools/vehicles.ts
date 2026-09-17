import { formatCurrency } from '@/lib/currency'
import { buildVehicleLabel } from '@/lib/vehicles/helpers'
import type { ToolContext } from './types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const VEHICLE_COLUMNS = 'id, plate, make, model, year, price, mileage, status, notes'

const STATUS_LABEL: Record<string, string> = {
  available: 'disponible',
  reserved: 'reservado',
  sold: 'vendido',
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

/** Strip filter metacharacters so PostgREST `.or()` / ilike stay safe. */
export function sanitizeSearchToken(raw: string): string {
  return String(raw ?? '')
    .replace(/[%_,()]/g, ' ')
    .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g, ' ')
    .trim()
    .slice(0, 40)
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

function presentVehicle(row: {
  id: string
  plate: string
  make: string
  model: string
  year: number
  price: number
  mileage: number | null
  status: string
  notes: string | null
}) {
  return {
    vehicle_id: row.id,
    label: buildVehicleLabel(row),
    plate: row.plate,
    make: row.make,
    model: row.model,
    year: row.year,
    price_cop: row.price,
    price_label: formatCurrency(row.price),
    mileage_km: row.mileage,
    status: row.status,
    status_label: STATUS_LABEL[row.status] ?? row.status,
    notes: row.notes,
  }
}

export async function searchVehicles(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const statusRaw = str(args, 'status').toLowerCase() || 'available'
  const status =
    statusRaw === 'all' || statusRaw === 'available' || statusRaw === 'reserved' || statusRaw === 'sold'
      ? statusRaw
      : 'available'
  const limitRaw = int(args, 'limit')
  const limit = Math.min(15, Math.max(1, limitRaw ?? 8))
  const query = sanitizeSearchToken(str(args, 'query'))
  const make = sanitizeSearchToken(str(args, 'make'))
  const model = sanitizeSearchToken(str(args, 'model'))
  const year = int(args, 'year')
  const minYear = int(args, 'min_year')
  const maxPrice = int(args, 'max_price')

  let q = ctx.db
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('account_id', ctx.accountId)

  if (status !== 'all') q = q.eq('status', status)
  if (make) q = q.ilike('make', `%${make}%`)
  if (model) q = q.ilike('model', `%${model}%`)
  if (year != null && year >= 1950 && year <= 2100) q = q.eq('year', year)
  if (minYear != null && minYear >= 1950) q = q.gte('year', minYear)
  if (maxPrice != null && maxPrice >= 0) q = q.lte('price', maxPrice)

  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean).slice(0, 4)
    for (const token of tokens) {
      const like = `%${token}%`
      const yearNum = Number.parseInt(token, 10)
      if (token.length === 4 && Number.isInteger(yearNum) && yearNum >= 1950 && yearNum <= 2100) {
        q = q.or(
          `plate.ilike.${like},make.ilike.${like},model.ilike.${like},year.eq.${yearNum}`,
        )
      } else {
        q = q.or(`plate.ilike.${like},make.ilike.${like},model.ilike.${like}`)
      }
    }
  }

  const { data, error } = await q
    .order('year', { ascending: false })
    .limit(limit)

  if (error) {
    return json({ ok: false, error: 'search_failed', message: error.message })
  }

  const vehicles = (data ?? []).map((row) =>
    presentVehicle(row as Parameters<typeof presentVehicle>[0]),
  )
  return json({
    ok: true,
    count: vehicles.length,
    currency: 'COP',
    vehicles,
    hint:
      vehicles.length === 0
        ? 'No matching vehicles. Try a broader query, another make/model, or status=all if asking about a specific plate.'
        : 'Quote price_label exactly. Only status=disponible is currently for sale.',
  })
}

export async function getVehicle(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<string> {
  const vehicleId = str(args, 'vehicle_id')
  if (!UUID_RE.test(vehicleId)) {
    return json({ ok: false, error: 'invalid_vehicle_id' })
  }

  const { data, error } = await ctx.db
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('id', vehicleId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()

  if (error) {
    return json({ ok: false, error: 'lookup_failed', message: error.message })
  }
  if (!data) {
    return json({ ok: false, error: 'not_found' })
  }

  return json({
    ok: true,
    currency: 'COP',
    vehicle: presentVehicle(data as Parameters<typeof presentVehicle>[0]),
  })
}
