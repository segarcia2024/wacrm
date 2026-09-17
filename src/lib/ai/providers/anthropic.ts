import { AiError, type ChatMessage, type ProviderResult, type ToolCall } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toAnthropicTools,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicContentBlock {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

type AnthropicWireMessage = {
  role: 'user' | 'assistant'
  content: string | Record<string, unknown>[]
}

function parseInput(input: unknown): string {
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input ?? {})
  } catch {
    return '{}'
  }
}

/**
 * Map our provider-neutral transcript (including tool rounds) onto
 * Anthropic's Messages API: tool results are `user` content blocks,
 * tool uses are `assistant` content blocks. Consecutive tool results
 * collapse into one user turn so roles keep alternating.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicWireMessage[] {
  const merged = mergeConsecutive(messages)
  const out: AnthropicWireMessage[] = []

  for (const m of merged) {
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.toolCallId ?? '',
        content: m.content,
      }
      const last = out[out.length - 1]
      if (last && last.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (m.toolCalls && m.toolCalls.length > 0) {
      const content: Record<string, unknown>[] = []
      if (m.content.trim()) {
        content.push({ type: 'text', text: m.content })
      }
      for (const tc of m.toolCalls) {
        let input: unknown = {}
        try {
          input = JSON.parse(tc.arguments || '{}')
        } catch {
          input = {}
        }
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input })
      }
      out.push({ role: 'assistant', content })
      continue
    }

    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }

  // Anthropic requires the transcript to start on `user`. Drop a leading
  // assistant greeting (an agent hello before the customer spoke). Never
  // drop an assistant tool-use turn — those always follow a user message
  // in our loop, so they shouldn't be first after this filter.
  while (out.length > 0 && out[0].role === 'assistant' && typeof out[0].content === 'string') {
    out.shift()
  }
  if (out.length === 0) {
    return [{ role: 'user', content: '(The customer has not sent a message yet.)' }]
  }
  return out
}

function parseToolCalls(blocks: AnthropicContentBlock[] | undefined): ToolCall[] {
  if (!blocks) return []
  const out: ToolCall[] = []
  for (const b of blocks) {
    if (b.type !== 'tool_use' || typeof b.name !== 'string' || !b.name) continue
    out.push({
      id: typeof b.id === 'string' && b.id ? b.id : `tu_${out.length + 1}`,
      name: b.name,
      arguments: parseInput(b.input),
    })
  }
  return out
}

/**
 * Call Anthropic's Messages API with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`). Empty text is allowed when the model requested
 * tool calls.
 */
export async function generateAnthropic(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools } = args
  const anthropicTools = toAnthropicTools(tools)

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: toAnthropicMessages(messages),
        ...(anthropicTools ? { tools: anthropicTools } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Anthropic', res)
  }

  const data = (await res.json().catch(() => null)) as AnthropicResponse | null
  const blocks = data?.content ?? []
  const text = blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
  const toolCalls = parseToolCalls(blocks)

  if (!text && toolCalls.length === 0) {
    throw new AiError('Anthropic returned an empty response.', {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usage?.input_tokens,
    completion: data?.usage?.output_tokens,
  })
  return {
    text,
    usage,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
