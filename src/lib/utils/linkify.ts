/**
 * Split plain text into literal and URL segments so the inbox can render
 * clickable links without pulling in a linkify dependency.
 *
 * Matches http(s) URLs and bare www. hosts. Trailing punctuation that
 * usually ends a sentence (.,;:!?) is left outside the URL.
 */

export type LinkifyPart =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string; href: string }

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?'")\]}>]/gi

function toHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

export function linkifyText(text: string): LinkifyPart[] {
  if (!text) return []

  const parts: LinkifyPart[] = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_RE)) {
    const value = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, index) })
    }
    parts.push({ type: 'url', value, href: toHref(value) })
    lastIndex = index + value.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }]
}
