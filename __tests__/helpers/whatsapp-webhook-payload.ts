/**
 * Fixtures that mimic Meta's WhatsApp Cloud API webhook shape.
 * Never send these to a real Meta endpoint — tests only.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export interface MockTextWebhookOptions {
  /** E.164 digits without '+', as Meta sends in `messages[].from` */
  from?: string
  contactName?: string
  textBody?: string
  messageId?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  /** Unix seconds string */
  timestamp?: string
  wabaId?: string
}

/** Canonical inbound text-message webhook body (WhatsApp Business Account). */
export function buildInboundTextWebhookPayload(
  options: MockTextWebhookOptions = {},
) {
  const from = options.from ?? '573001234567'
  const contactName = options.contactName ?? 'Cliente de Prueba'
  const textBody = options.textBody ?? 'Hola, quiero información de un vehículo'
  const messageId = options.messageId ?? 'wamid.MOCK_TEST_MESSAGE_001'
  const phoneNumberId = options.phoneNumberId ?? '123456789012345'
  const displayPhoneNumber = options.displayPhoneNumber ?? '573109876543'
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const wabaId = options.wabaId ?? '102938475610293'

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: contactName },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp,
                  type: 'text' as const,
                  text: { body: textBody },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}

export interface MockButtonWebhookOptions {
  from?: string
  contactName?: string
  buttonText?: string
  buttonPayload?: string
  /** Meta wamid of the outbound template the customer is replying to */
  contextMessageId?: string
  messageId?: string
  phoneNumberId?: string
  displayPhoneNumber?: string
  timestamp?: string
  wabaId?: string
}

/** Inbound template quick-reply tap (`type: "button"`). */
export function buildInboundButtonWebhookPayload(
  options: MockButtonWebhookOptions = {},
) {
  const from = options.from ?? '573001234567'
  const contactName = options.contactName ?? 'Cliente de Prueba'
  const buttonText = options.buttonText ?? 'Sí, sigo buscando'
  const buttonPayload = options.buttonPayload ?? 'yes_still_looking'
  const messageId = options.messageId ?? 'wamid.MOCK_TEST_BUTTON_001'
  const contextMessageId =
    options.contextMessageId ?? 'wamid.MOCK_OUTBOUND_TEMPLATE_001'
  const phoneNumberId = options.phoneNumberId ?? '123456789012345'
  const displayPhoneNumber = options.displayPhoneNumber ?? '573109876543'
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const wabaId = options.wabaId ?? '102938475610293'

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: displayPhoneNumber,
                phone_number_id: phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: contactName },
                  wa_id: from,
                },
              ],
              messages: [
                {
                  from,
                  id: messageId,
                  timestamp,
                  type: 'button' as const,
                  button: {
                    text: buttonText,
                    payload: buttonPayload,
                  },
                  context: {
                    from: displayPhoneNumber,
                    id: contextMessageId,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  }
}
