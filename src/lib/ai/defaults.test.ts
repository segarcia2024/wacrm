import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, HANDOFF_SENTINEL } from './defaults'

describe('buildSystemPrompt — CRM tools', () => {
  it('teaches live inventory + booking when writes are allowed', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      tools: { allowWrites: true, now: new Date('2026-09-03T17:00:00.000Z') },
    })
    expect(prompt).toContain('search_vehicles')
    expect(prompt).toContain('create_appointment')
    expect(prompt).toContain('America/Bogota')
    expect(prompt).toContain(HANDOFF_SENTINEL)
    expect(prompt).toContain('you CAN book')
  })

  it('forbids booking in draft/playground mode', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'draft',
      tools: { allowWrites: false },
    })
    expect(prompt).toContain('search_vehicles')
    expect(prompt).toContain('CANNOT create')
    expect(prompt).not.toContain('you CAN book')
  })
})
