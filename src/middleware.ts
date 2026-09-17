import { createServerClient } from '@supabase/ssr'

import type { Database } from '@/types/database'
import { NextResponse, type NextRequest } from 'next/server'

import { isSafeRedirectPath } from '@/lib/auth/safe-redirect'
import { timedFetch } from '@/lib/supabase/timed-fetch'
import {
  clearSupabaseAuthCookies,
  hasSupabaseAuthCookies,
  isStaleRefreshTokenError,
} from '@/lib/supabase/auth-cookies'

function resolvePostAuthRedirect(request: NextRequest): string {
  const redirectTo = request.nextUrl.searchParams.get('redirect')
  if (redirectTo && isSafeRedirectPath(redirectTo)) {
    return redirectTo
  }
  return '/dashboard'
}

export async function middleware(request: NextRequest) {
  const isAuthLoginPost =
    request.method === 'POST' && request.nextUrl.pathname === '/api/auth/login'

  // Login writes its own Set-Cookie. Creating a supabase client or
  // clearing stale tokens here produces middleware Set-Cookie headers
  // that win the merge and the new session never reaches the browser.
  if (isAuthLoginPost) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: timedFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const requestCookies = request.cookies.getAll()
  let user = null

  // Skip Auth API calls when there is no session cookie — avoids noise on
  // first visits and after cookies have been cleared.
  if (hasSupabaseAuthCookies(requestCookies)) {
    const {
      data: { user: resolvedUser },
      error: authError,
    } = await supabase.auth.getUser()

    user = resolvedUser

    if (authError && !user && isStaleRefreshTokenError(authError)) {
      clearSupabaseAuthCookies(request, supabaseResponse)
      user = null
    }
  }

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  const isServerAction =
    request.method === 'POST' &&
    (request.headers.has('next-action') || request.headers.has('Next-Action'))

  // Never redirect Server Actions — redirects break the POST.
  if (isServerAction) {
    return supabaseResponse
  }

  // API routes — deny by default for unauthenticated callers.
  // Allowlist: public auth, Meta webhook, invitation peek, public REST
  // (API-key auth), and cron endpoints (shared secret).
  // Session-protected APIs still re-check getUser()/requireRole in-route;
  // this layer stops anonymous probing of private handlers.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const path = request.nextUrl.pathname
    const isPublicApi =
      path === '/api/health' ||
      path === '/api/auth/login' ||
      path === '/api/whatsapp/webhook' ||
      path === '/api/billing/events' ||
      path.startsWith('/api/v1/') ||
      path === '/api/automations/cron' ||
      path === '/api/flows/cron' ||
      path === '/api/appointments/cron' ||
      /^\/api\/invitations\/[^/]+\/peek$/.test(path)

    if (!isPublicApi && !user) {
      return withRefreshedCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      )
    }
  }

  // Root — CRM-only MVP (no public landing). Signed-in users go to the
  // dashboard; everyone else lands on login.
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dashboard' : '/login'
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  //
  // `/reset-password` is intentionally excluded: after the email
  // recovery link, the user HAS a session (recovery) and must stay
  // on that page to set a new password.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = resolvePostAuthRedirect(request)
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated.
  // Keep in sync with `(dashboard)` routes; layout.tsx also re-checks
  // getUser(), but middleware must not leave gaps that flash UI or
  // leak route existence to unauthenticated crawlers.
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/pipelines',
    '/agenda',
    '/broadcasts',
    '/automations',
    '/flows',
    '/inventory',
    '/notifications',
    '/agents',
    '/settings',
    '/billing',
  ]
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
