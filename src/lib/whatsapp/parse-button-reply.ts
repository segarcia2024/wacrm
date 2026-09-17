/**
 * Map Meta's template quick-reply webhook envelope (`type: "button"`)
 * into the same shape we use for interactive `button_reply` taps.
 *
 * Meta delivers:
 *   { type: "button", button: { text: "<label>", payload: "<id>" } }
 * where `text` is what the customer saw on the phone and `payload` is
 * the developer-defined value from the template button component.
 */
export function parseTemplateButtonReply(
  button: { text?: string; payload?: string } | undefined | null,
): {
  contentText: string | null
  interactiveReplyId: string | null
} {
  const text = button?.text?.trim() || null
  const payload = button?.payload?.trim() || null
  if (!text && !payload) {
    return { contentText: '[Button reply]', interactiveReplyId: null }
  }
  return {
    contentText: text || payload,
    interactiveReplyId: payload || text,
  }
}
