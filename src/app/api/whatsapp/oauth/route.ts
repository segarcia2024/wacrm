import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashVerifyToken } from '@/lib/whatsapp/verify-token-hash'
import { encrypt } from '@/lib/whatsapp/encryption'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  exchangeCodeForBusinessToken,
  exchangeForLongLivedToken,
  listWabaPhoneNumbers,
} from '@/lib/whatsapp/oauth'
import {
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { randomBytes } from 'crypto'

/**
 * POST /api/whatsapp/oauth
 *
 * Completes WhatsApp Embedded Signup for the caller's account:
 *   1. Auth — admin+ on the account (same bar as Settings → WhatsApp)
 *   2. Exchange the short-lived `code` for a customer business token
 *   3. Prefer long-lived token when Meta allows the exchange
 *   4. Resolve waba_id + phone_number_id (body or Graph fallback)
 *   5. Verify + subscribe WABA webhooks
 *   6. Persist encrypted credentials on `whatsapp_config` (account_id)
 *
 * Body:
 *   {
 *     code: string
 *     waba_id?: string
 *     phone_number_id?: string
 *   }
 */

interface OAuthBody {
  code?: unknown
  waba_id?: unknown
  phone_number_id?: unknown
}


function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, accountId } = await requireRole('admin')
    const limit = await checkRateLimit(`whatsapp:oauth:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    let body: OAuthBody
    try {
      body = (await request.json()) as OAuthBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const code = asNonEmptyString(body.code)
    if (!code) {
      return NextResponse.json(
        { error: 'code is required (Embedded Signup authorization code)' },
        { status: 400 },
      )
    }

    // ── 1. Code → business token (must happen within ~30s of FB.login) ──
    let accessToken: string
    let expiresIn: number | null = null
    try {
      const shortLived = await exchangeCodeForBusinessToken(code)
      accessToken = shortLived.accessToken
      expiresIn = shortLived.expiresIn
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token exchange failed'
      console.error('[whatsapp/oauth] code exchange failed:', message)
      return NextResponse.json(
        { error: `Meta token exchange failed: ${message}` },
        { status: 400 },
      )
    }

    // ── 2. Prefer long-lived token when Meta supports the exchange ──
    try {
      const longLived = await exchangeForLongLivedToken(accessToken)
      accessToken = longLived.accessToken
      expiresIn = longLived.expiresIn ?? expiresIn
    } catch (err) {
      // Non-fatal: some Embedded Signup business tokens reject
      // fb_exchange_token. Keep the token from step 1.
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        '[whatsapp/oauth] long-lived exchange skipped:',
        message,
      )
    }

    // ── 3. Resolve WABA + phone number IDs ──
    let wabaId = asNonEmptyString(body.waba_id)
    let phoneNumberId = asNonEmptyString(body.phone_number_id)

    if (!wabaId) {
      return NextResponse.json(
        {
          error:
            'waba_id is required. The Embedded Signup session-info message did not arrive — retry the connection.',
        },
        { status: 400 },
      )
    }

    if (!phoneNumberId) {
      try {
        const phones = await listWabaPhoneNumbers({
          wabaId,
          accessToken,
        })
        if (phones.length === 0) {
          return NextResponse.json(
            {
              error:
                'No phone numbers found on the connected WhatsApp Business Account.',
            },
            { status: 400 },
          )
        }
        phoneNumberId = phones[0].id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed'
        console.error('[whatsapp/oauth] phone_numbers lookup failed:', message)
        return NextResponse.json(
          { error: `Could not resolve phone_number_id: ${message}` },
          { status: 400 },
        )
      }
    }

    // ── 4. Reject phone_number_id claimed by another account ──
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phoneNumberId)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('[whatsapp/oauth] ownership check failed:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 },
      )
    }
    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance.',
        },
        { status: 409 },
      )
    }

    // ── 5. Verify credentials against Graph ──
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId,
        accessToken,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/oauth] verifyPhoneNumber failed:', message)
      return NextResponse.json(
        { error: `Meta API rejected the credentials: ${message}` },
        { status: 400 },
      )
    }

    // ── 6. Subscribe WABA to this app (webhooks) ──
    let subscribedAppsAt: string | null = null
    try {
      await subscribeWabaToApp({ wabaId, accessToken })
      subscribedAppsAt = new Date().toISOString()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[whatsapp/oauth] subscribed_apps failed (non-fatal):', message)
    }

    // ── 7. Encrypt + persist on whatsapp_config ──
    let encryptedAccessToken: string
    let encryptedVerifyToken: string
    let verifyTokenHash: string
    try {
      encryptedAccessToken = encrypt(accessToken)
      // Fresh webhook verify token for this account — Meta App Dashboard
      // still uses the app-level token; this row enables multi-tenant GET
      // challenge matching if the dealer configures the same value.
      const rawVerifyToken = randomBytes(24).toString('hex')
      encryptedVerifyToken = encrypt(rawVerifyToken)
      verifyTokenHash = hashVerifyToken(rawVerifyToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Encryption error'
      console.error('[whatsapp/oauth] encrypt failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string.',
        },
        { status: 500 },
      )
    }

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, registered_at')
      .eq('account_id', accountId)
      .maybeSingle()

    const now = new Date().toISOString()
    const baseRow = {
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      verify_token_hash: verifyTokenHash,
      status: 'connected' as const,
      connected_at: now,
      // Embedded Signup does not collect the 2FA PIN — leave
      // registered_at untouched if already set; otherwise null so the
      // Settings UI can prompt for /register when needed.
      registered_at: existing?.registered_at ?? null,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: null,
      updated_at: now,
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('[whatsapp/oauth] update failed:', updateError)
        return NextResponse.json(
          { error: 'Failed to update WhatsApp configuration' },
          { status: 500 },
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: userId,
          ...baseRow,
        })

      if (insertError) {
        console.error('[whatsapp/oauth] insert failed:', insertError)
        return NextResponse.json(
          { error: 'Failed to save WhatsApp configuration' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      saved: true,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      expires_in: expiresIn,
      subscribed: subscribedAppsAt != null,
      registered: existing?.registered_at != null,
      phone_info: phoneInfo,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
