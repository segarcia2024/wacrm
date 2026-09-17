import { NextResponse } from 'next/server'

import { isSafeRedirectPath } from '@/lib/auth/safe-redirect'
import { createRouteHandlerClient } from '@/lib/supabase/route-handler'

/**
 * GET /auth/callback
 *
 * Completes Supabase Auth PKCE (password recovery, magic link, OAuth).
 * Exchanges `?code=` for a session cookie, then redirects to `?next=`.
 *
 * Used by forgot-password:
 *   redirectTo: `${origin}/auth/callback?next=/reset-password`
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') ?? '/dashboard'
  const next = isSafeRedirectPath(nextParam) ? nextParam : '/dashboard'
  const origin = url.origin

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=missing_code`,
    )
  }

  const { supabase, applyCookiesTo } = await createRouteHandlerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(
      `${origin}/login?error=auth_callback`,
    )
  }

  return applyCookiesTo(NextResponse.redirect(`${origin}${next}`))
}
