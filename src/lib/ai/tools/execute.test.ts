import { describe, expect, it } from 'vitest'
import { executeTool } from './execute'
import type { ToolContext } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

const ctx: ToolContext = {
  db: { from: () => ({}) } as unknown as SupabaseClient,
  accountId: 'acct-1',
  allowWrites: false,
}

describe('executeTool', () => {
  it('returns unknown_tool for a name the model invented', async () => {
    const result = JSON.parse(
      await executeTool({ id: 'c1', name: 'delete_everything', arguments: '{}' }, ctx),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('unknown_tool')
  })

  it('returns invalid_arguments on broken JSON', async () => {
    const result = JSON.parse(
      await executeTool(
        { id: 'c1', name: 'search_vehicles', arguments: '{not json' },
        ctx,
      ),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid_arguments')
  })
})
