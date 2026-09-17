import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateReply, parseGeneration } from './generate'
import { AiError, type AiConfig } from './types'
import { CRM_TOOLS } from './tools/definitions'
import type { ToolContext } from './tools/types'
import type { SupabaseClient } from '@supabase/supabase-js'

function config(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: false,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    ...overrides,
  }
}

function okResponse(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as unknown as Response
}

function errResponse(status: number, json: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => json,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('parseGeneration', () => {
  it('returns text with no handoff', () => {
    expect(parseGeneration('Hello there')).toEqual({
      text: 'Hello there',
      handoff: false,
      usage: null,
    })
  })

  it('detects + strips the handoff sentinel', () => {
    expect(parseGeneration('[[HANDOFF]]')).toEqual({
      text: '',
      handoff: true,
      usage: null,
    })
    expect(parseGeneration('Let me get a human [[HANDOFF]]')).toEqual({
      text: 'Let me get a human',
      handoff: true,
      usage: null,
    })
  })

  it('passes usage straight through', () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    expect(parseGeneration('Hi', usage)).toEqual({
      text: 'Hi',
      handoff: false,
      usage,
    })
  })
})

describe('generateReply — OpenAI', () => {
  it('calls the chat completions endpoint and returns the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'Sure — happy to help!' } }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'openai' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res).toEqual({
      text: 'Sure — happy to help!',
      handoff: false,
      usage: { promptTokens: 42, completionTokens: 8, totalTokens: 50 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.openai.com')
    expect(opts.headers.Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(opts.body)
    expect(body.tools).toBeUndefined()
  })

  it('maps a 401 to an invalid_key AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        errResponse(401, { error: { message: 'Incorrect API key' } }),
      ),
    )

    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_key', status: 401 })
  })

  it('throws on an empty completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: '' } }] })),
    )
    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toBeInstanceOf(AiError)
  })
})

describe('generateReply — Anthropic', () => {
  it('calls the messages endpoint with the version header and parses text blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        content: [{ type: 'text', text: 'Hi there!' }],
        usage: { input_tokens: 30, output_tokens: 6 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'anthropic', apiKey: 'sk-ant-x' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Anthropic reports input/output only — total is summed by normalizeUsage.
    expect(res).toEqual({
      text: 'Hi there!',
      handoff: false,
      usage: { promptTokens: 30, completionTokens: 6, totalTokens: 36 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.anthropic.com')
    expect(opts.headers['x-api-key']).toBe('sk-ant-x')
    expect(opts.headers['anthropic-version']).toBeTruthy()
  })

  it('detects handoff in the model output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: '[[HANDOFF]]' }] }),
      ),
    )
    const res = await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'I want to speak to a person' }],
    })
    expect(res.handoff).toBe(true)
    expect(res.text).toBe('')
  })

  it('drops a leading assistant turn so the payload starts on the customer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'ok' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Hi' },
      ],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages).toHaveLength(1)
  })
})

function mockVehicleDb(): ToolContext {
  const mazda = {
    id: '11111111-1111-4111-8111-111111111111',
    plate: 'ABC123',
    make: 'MAZDA',
    model: '3',
    year: 2018,
    price: 45_000_000,
    mileage: 42000,
    status: 'available',
    notes: null,
  }
  const builder: Record<string, unknown> = {}
  const self = new Proxy(builder, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [mazda], error: null }).then(resolve, reject)
      }
      if (prop === 'maybeSingle' || prop === 'single') {
        return () => Promise.resolve({ data: mazda, error: null })
      }
      return () => self
    },
  })
  return {
    db: { from: () => self } as unknown as SupabaseClient,
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    actorUserId: 'user-1',
    allowWrites: true,
  }
}

describe('generateReply — tool loop', () => {
  it('calls search_vehicles then returns the final OpenAI reply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'search_vehicles',
                      arguments: '{"query":"mazda"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          choices: [{ message: { content: 'Tenemos un Mazda 3 2018 a $45.000.000.' } }],
          usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'openai' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Tienen mazda?' }],
      tools: CRM_TOOLS,
      toolContext: mockVehicleDb(),
    })

    expect(res.text).toContain('Mazda 3')
    expect(res.handoff).toBe(false)
    expect(res.usage).toEqual({
      promptTokens: 90,
      completionTokens: 24,
      totalTokens: 114,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(firstBody.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({ name: 'search_vehicles' }),
        }),
      ]),
    )

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    const roles = secondBody.messages.map((m: { role: string }) => m.role)
    expect(roles).toContain('tool')
  })

  it('runs an Anthropic tool_use round', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okResponse({
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'search_vehicles',
              input: { query: 'mazda' },
            },
          ],
          usage: { input_tokens: 12, output_tokens: 6 },
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          content: [{ type: 'text', text: 'Sí, hay un Mazda 3 disponible.' }],
          usage: { input_tokens: 40, output_tokens: 10 },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Tienen mazda?' }],
      tools: CRM_TOOLS,
      toolContext: mockVehicleDb(),
    })

    expect(res.text).toContain('Mazda 3')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(firstBody.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'search_vehicles' })]),
    )
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    const lastUser = secondBody.messages[secondBody.messages.length - 1]
    expect(lastUser.role).toBe('user')
    expect(lastUser.content[0].type).toBe('tool_result')
  })
})

