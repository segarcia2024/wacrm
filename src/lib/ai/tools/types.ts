import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolCall } from '../types'

export type { ToolCall }

/**
 * Runtime context for CRM tools the model can call (inventory + agenda).
 * Always scoped to one account; writes are opt-in so draft/playground
 * can look up stock without creating appointments.
 */
export interface ToolContext {
  db: SupabaseClient
  accountId: string
  conversationId?: string | null
  contactId?: string | null
  /** auth.users.id used as appointments.user_id (audit). */
  actorUserId?: string | null
  /** profiles.id to assign the appointment to, when booking. */
  defaultAssigneeId?: string | null
  allowWrites: boolean
  /** Injected in tests; defaults to `new Date()`. */
  now?: Date
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}
