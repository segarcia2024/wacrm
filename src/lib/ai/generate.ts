import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs, MAX_TOOL_ROUNDS } from './defaults'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'
import { executeTool } from './tools/execute'
import type { ToolDefinition, ToolContext } from './tools/types'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
  /** CRM tools the model may call. Omit to keep a plain completion. */
  tools?: ToolDefinition[]
  /** Required when `tools` is set — scopes inventory/agenda to the account. */
  toolContext?: ToolContext
}

function addUsage(a: AiUsage | null, b: AiUsage | null): AiUsage | null {
  if (!a) return b
  if (!b) return a
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

/**
 * Generate the next reply from the account's configured provider.
 * When CRM tools are provided, runs a short tool loop (inventory lookup,
 * slot check, booking) then returns the final customer-facing text.
 * Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages, tools, toolContext } = args
  const timeoutMs = aiRequestTimeoutMs()
  const toolsEnabled = Boolean(tools && tools.length > 0 && toolContext)
  const maxRounds = toolsEnabled ? MAX_TOOL_ROUNDS : 1

  let transcript: ChatMessage[] = [...messages]
  let usage: AiUsage | null = null

  for (let round = 0; round < maxRounds; round++) {
    const includeTools = toolsEnabled && round < maxRounds - 1
    const providerArgs = {
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt,
      messages: transcript,
      timeoutMs,
      tools: includeTools ? tools : undefined,
    }

    const result =
      config.provider === 'openai'
        ? await generateOpenAi(providerArgs)
        : config.provider === 'anthropic'
          ? await generateAnthropic(providerArgs)
          : (() => {
              throw new AiError(`Unsupported AI provider: ${config.provider}`, {
                code: 'unsupported_provider',
                status: 400,
              })
            })()

    usage = addUsage(usage, result.usage)

    const toolCalls = result.toolCalls ?? []
    if (toolCalls.length === 0 || !includeTools || !toolContext) {
      return parseGeneration(result.text, usage)
    }

    transcript = [
      ...transcript,
      {
        role: 'assistant',
        content: result.text,
        toolCalls,
      },
    ]

    for (const call of toolCalls) {
      const content = await executeTool(call, toolContext)
      transcript.push({
        role: 'tool',
        content,
        toolCallId: call.id,
        name: call.name,
      })
    }
  }

  return parseGeneration('', usage)
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null,
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  const text = raw.split(HANDOFF_SENTINEL).join('').trim()
  return { text, handoff, usage }
}
