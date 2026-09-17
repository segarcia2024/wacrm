import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { dbErrorResponse } from '@/lib/http/errors'
import { parseJsonBody } from '@/lib/http/parse-body'
import { validateInteractivePayload } from '@/lib/whatsapp/interactive'

const createQuickReplySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  kind: z.enum(['text', 'interactive']).optional(),
  content_text: z.string().max(4096).optional(),
  interactive_payload: z.unknown().optional(),
})

// Quick replies — reusable snippets (plain text or a saved interactive
// message) shared across the account. GET lists; POST creates. Mirrors
// the automations route: RLS-scoped read via the user client, service-
// role write after an explicit role check.

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    // RLS (quick_replies_select) scopes to the caller's account.
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return dbErrorResponse('quick-replies/GET', error)
    return NextResponse.json({ quick_replies: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const parsed = await parseJsonBody(request, createQuickReplySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const title = body.title
  const kind = body.kind === 'interactive' ? 'interactive' : 'text'

  let content_text: string | null = null
  let interactive_payload: unknown = null

  if (kind === 'interactive') {
    const result = validateInteractivePayload(body.interactive_payload)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    interactive_payload = body.interactive_payload
  } else {
    const text = body.content_text ?? ''
    if (!text.trim()) {
      return NextResponse.json(
        { error: 'content_text is required for text quick replies' },
        { status: 400 },
      )
    }
    content_text = text
  }

  const { data, error } = await supabaseAdmin()
    .from('quick_replies')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      title,
      kind,
      content_text,
      interactive_payload,
    })
    .select()
    .single()

  if (error) return dbErrorResponse('quick-replies/POST', error)
  return NextResponse.json({ quick_reply: data }, { status: 201 })
}
