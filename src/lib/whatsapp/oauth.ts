/**
 * WhatsApp Embedded Signup — server-side Graph OAuth helpers.
 *
 * Meta returns a short-lived authorization `code` from FB.login
 * (TTL ≈ 30s). We exchange it immediately for a customer-scoped
 * **business access token** (the token Cloud API actually needs).
 *
 * Note on naming: Meta docs distinguish that token from a partner
 * *System User* token (used by Solution Partners for credit-line
 * sharing). REVIO stores the customer business token in
 * `whatsapp_config.access_token` (AES-GCM encrypted).
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface BusinessTokenResult {
  accessToken: string
  /** Seconds until expiry when Meta returns it; omitted for non-expiring tokens. */
  expiresIn: number | null
  tokenType: string | null
}

export interface WabaPhoneNumber {
  id: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: string
}

interface MetaOAuthTokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: { message?: string; type?: string; code?: number }
}

interface MetaPhoneNumbersResponse {
  data?: WabaPhoneNumber[]
  error?: { message?: string }
}

function requireMetaAppCredentials(): { appId: string; appSecret: string } {
  // Prefer server-only META_APP_ID; fall back to the public id when
  // only NEXT_PUBLIC_* is configured (common in single-env SaaS setups).
  // Use `||` so empty strings are treated as unset.
  const appId =
    process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || ''
  const appSecret = process.env.META_APP_SECRET || ''
  if (!appId || !appSecret) {
    throw new Error(
      'META_APP_ID (or NEXT_PUBLIC_META_APP_ID) and META_APP_SECRET must be set for Embedded Signup.',
    )
  }
  return { appId, appSecret }
}

/**
 * Exchange the Embedded Signup authorization code for a customer
 * business access token. Must be called within ~30s of FB.login.
 */
export async function exchangeCodeForBusinessToken(
  code: string,
): Promise<BusinessTokenResult> {
  const { appId, appSecret } = requireMetaAppCredentials()

  const url = new URL(`${META_API_BASE}/oauth/access_token`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('code', code)

  let response: Response
  try {
    response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    throw new Error(`Failed to reach Meta OAuth endpoint: ${message}`)
  }

  let data: MetaOAuthTokenResponse
  try {
    data = (await response.json()) as MetaOAuthTokenResponse
  } catch {
    throw new Error(`Meta OAuth returned a non-JSON response (${response.status})`)
  }

  if (!response.ok || data.error?.message || !data.access_token) {
    throw new Error(
      data.error?.message ??
        `Meta OAuth token exchange failed (${response.status})`,
    )
  }

  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    tokenType: data.token_type ?? null,
  }
}

/**
 * Extend a short-lived user/business token when Meta returns one.
 * Idempotent for tokens that are already long-lived — Meta may
 * return the same token or a longer-lived variant.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<BusinessTokenResult> {
  const { appId, appSecret } = requireMetaAppCredentials()

  const url = new URL(`${META_API_BASE}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('fb_exchange_token', shortLivedToken)

  let response: Response
  try {
    response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    throw new Error(`Failed to reach Meta long-lived token endpoint: ${message}`)
  }

  let data: MetaOAuthTokenResponse
  try {
    data = (await response.json()) as MetaOAuthTokenResponse
  } catch {
    throw new Error(
      `Meta long-lived exchange returned a non-JSON response (${response.status})`,
    )
  }

  if (!response.ok || data.error?.message || !data.access_token) {
    throw new Error(
      data.error?.message ??
        `Meta long-lived token exchange failed (${response.status})`,
    )
  }

  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
    tokenType: data.token_type ?? null,
  }
}

/**
 * List phone numbers on a WABA — used when the session-info postMessage
 * omitted phone_number_id (rare) or the client only sent waba_id.
 */
export async function listWabaPhoneNumbers(args: {
  wabaId: string
  accessToken: string
}): Promise<WabaPhoneNumber[]> {
  const { wabaId, accessToken } = args
  const url = new URL(`${META_API_BASE}/${wabaId}/phone_numbers`)
  url.searchParams.set(
    'fields',
    'id,display_phone_number,verified_name,quality_rating',
  )

  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    throw new Error(`Failed to list WABA phone numbers: ${message}`)
  }

  let data: MetaPhoneNumbersResponse
  try {
    data = (await response.json()) as MetaPhoneNumbersResponse
  } catch {
    throw new Error(
      `Meta phone_numbers returned a non-JSON response (${response.status})`,
    )
  }

  if (!response.ok || data.error?.message) {
    throw new Error(
      data.error?.message ??
        `Failed to list phone numbers for WABA ${wabaId} (${response.status})`,
    )
  }

  return data.data ?? []
}
