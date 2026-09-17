const PRODUCTION_TIMEOUT_MS = 20_000

/**
 * fetch() wrapper with a hard timeout in production so a hung Auth
 * call cannot pin nginx until `proxy_read_timeout` (504).
 *
 * Disabled in `next dev`: from this Mac, DNS/IPv6 to supabase.co
 * often exceeds 10s and aborting getUser() wedged /login (~34s of
 * retries). A caller-provided `signal` always wins.
 */
export function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.signal || process.env.NODE_ENV === "development") {
    return fetch(input, init)
  }
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(PRODUCTION_TIMEOUT_MS),
  })
}
