import { AiError, type ChatMessage, type ProviderResult, type ToolCall } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  toOpenAiTools,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiToolCall {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string | null
      tool_calls?: OpenAiToolCall[]
    }
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

function toOpenAiMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return mergeConsecutive(messages).map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId ?? '',
        content: m.content,
      }
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: m.role, content: m.content }
  })
}

function parseToolCalls(raw: OpenAiToolCall[] | undefined): ToolCall[] {
  if (!raw || raw.length === 0) return []
  const out: ToolCall[] = []
  for (const tc of raw) {
    const name = tc.function?.name
    if (!name) continue
    out.push({
      id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${out.length + 1}`,
      name,
      arguments:
        typeof tc.function?.arguments === 'string' ? tc.function.arguments : '{}',
    })
  }
  return out
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`). Empty text is allowed when the model requested
 * tool calls.
 */
export async function generateOpenAi(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools } = args
  const openAiTools = toOpenAiTools(tools)

  let res: Response
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...toOpenAiMessages(messages),
        ],
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        ...(openAiTools
          ? { tools: openAiTools, tool_choice: 'auto' }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('OpenAI', res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const message = data?.choices?.[0]?.message
  const toolCalls = parseToolCalls(message?.tool_calls)
  const text =
    typeof message?.content === 'string' ? message.content : ''

  if ((!text || !text.trim()) && toolCalls.length === 0) {
    throw new AiError('OpenAI returned an empty response.', {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return {
    text,
    usage,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
