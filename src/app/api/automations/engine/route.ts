import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import type { AutomationTriggerType } from '@/types'
import { parseJsonBody } from '@/lib/http/parse-body'
import { internalErrorResponse } from '@/lib/http/errors'

const TRIGGER_TYPES = [
  'new_message_received',
  'first_inbound_message',
  'keyword_match',
  'new_contact_created',
  'conversation_assigned',
  'tag_added',
  'time_based',
  'interactive_reply',
] as const satisfies readonly AutomationTriggerType[]

const engineBodySchema = z.object({
  trigger_type: z.enum(TRIGGER_TYPES),
  contact_id: z.string().uuid().nullable().optional(),
  context: z.record(z.unknown()).optional().default({}),
})

/**
 * Manual trigger for testing or for external integrations that want
 * to fire automations. Auth is required — we resolve the caller's
 * account_id and dispatch over the account's automations.
 */
export async function POST(request: Request) {
  // Firing automations sends outbound WhatsApp — a write action. Require
  // at least `agent`; a viewer must not be able to trigger sends.
  let accountId: string
  try {
    const ctx = await requireRole('agent')
    const limit = await checkRateLimit(`automations:engine:${ctx.userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)
    accountId = ctx.accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const parsed = await parseJsonBody(request, engineBodySchema)
  if (!parsed.ok) return parsed.response

  try {
    await runAutomationsForTrigger({
      accountId,
      triggerType: parsed.data.trigger_type,
      contactId: parsed.data.contact_id ?? null,
      context: parsed.data.context ?? {},
    })
  } catch (err) {
    return internalErrorResponse('automations/engine', err)
  }

  return NextResponse.json({ ok: true })
}
