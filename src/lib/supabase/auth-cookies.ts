import type { NextRequest, NextResponse } from 'next/server'

/** Supabase SSR auth cookie names: `sb-<project-ref>-auth-token` (+ `.0`, `.1` chunks). */
export function isSupabaseAuthCookie(name: string): boolean {
  return name.includes('-auth-token')
}

export function hasSupabaseAuthCookies(
  cookies: Array<{ name: string }>,
): boolean {
  return cookies.some((cookie) => isSupabaseAuthCookie(cookie.name))
}

/**
 * Remove Supabase auth cookies from the outgoing response without calling
 * the Auth API (avoids duplicate refresh_token_not_found noise on signOut).
 */
export function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
): void {
  for (const { name } of request.cookies.getAll()) {
    if (isSupabaseAuthCookie(name)) {
      response.cookies.delete(name)
    }
  }
}

export function isStaleRefreshTokenError(error: {
  code?: string
  message?: string
}): boolean {
  return (
    error.code === 'refresh_token_not_found' ||
    error.code === 'invalid_refresh_token' ||
    Boolean(error.message?.includes('Refresh Token'))
  )
}
