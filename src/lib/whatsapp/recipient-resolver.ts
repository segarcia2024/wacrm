/**
 * WhatsAppRecipientResolver — the only place that decides how we
 * address a contact on the Cloud API.
 *
 * Meta:
 *   - phone → JSON field `to`
 *   - BSUID → JSON field `recipient`
 *   - username is never a destination
 * If both `to` and `recipient` are sent, Meta lets `to` win. We send
 * exactly one so the choice is explicit.
 */

import {
  resolveWhatsAppRecipient,
  resolveOutboundRecipient,
  type WhatsAppRecipient,
} from './wa-identity'

export {
  resolveWhatsAppRecipient,
  resolveOutboundRecipient,
  type WhatsAppRecipient,
}

export type MetaMessageAddress = {
  to?: string
  recipient?: string
}

export function toMetaMessageAddress(
  resolved: WhatsAppRecipient,
  attemptValue?: string,
): MetaMessageAddress {
  const value = attemptValue ?? resolved.value
  if (resolved.type === 'phone') return { to: value }
  return { recipient: value }
}
