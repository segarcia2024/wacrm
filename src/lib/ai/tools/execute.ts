import type { ToolCall, ToolContext } from './types'
import {
  CHECK_APPOINTMENT_SLOT,
  CREATE_APPOINTMENT,
  GET_VEHICLE,
  LIST_CONTACT_APPOINTMENTS,
  SEARCH_VEHICLES,
} from './definitions'
import { getVehicle, searchVehicles } from './vehicles'
import {
  checkAppointmentSlot,
  createAppointment,
  listContactAppointments,
} from './appointments'

function json(value: unknown): string {
  return JSON.stringify(value)
}

function parseArgs(raw: string): Record<string, unknown> | { error: string } {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return {}
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { error: 'arguments must be a JSON object' }
  } catch {
    return { error: 'arguments are not valid JSON' }
  }
}

/**
 * Run one model tool call against the CRM. Never throws: failures are
 * JSON the model can read and recover from (or hand off).
 */
export async function executeTool(
  call: ToolCall,
  ctx: ToolContext,
): Promise<string> {
  try {
    const args = parseArgs(call.arguments)
    if ('error' in args && Object.keys(args).length === 1) {
      return json({ ok: false, error: 'invalid_arguments', message: args.error })
    }

    switch (call.name) {
      case SEARCH_VEHICLES:
        return await searchVehicles(ctx, args)
      case GET_VEHICLE:
        return await getVehicle(ctx, args)
      case CHECK_APPOINTMENT_SLOT:
        return await checkAppointmentSlot(ctx, args)
      case CREATE_APPOINTMENT:
        return await createAppointment(ctx, args)
      case LIST_CONTACT_APPOINTMENTS:
        return await listContactAppointments(ctx, args)
      default:
        return json({ ok: false, error: 'unknown_tool', name: call.name })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ ok: false, error: 'tool_failed', message })
  }
}
