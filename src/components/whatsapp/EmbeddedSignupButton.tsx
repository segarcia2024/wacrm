'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const FB_ORIGINS = new Set([
  'https://www.facebook.com',
  'https://web.facebook.com',
])
const GRAPH_VERSION = 'v21.0'
/** How long we wait for the WA_EMBEDDED_SIGNUP session-info postMessage. */
const SESSION_INFO_TIMEOUT_MS = 15_000

export interface EmbeddedSignupSession {
  wabaId: string
  phoneNumberId: string
}

export interface EmbeddedSignupSuccess {
  waba_id: string
  phone_number_id: string
  phone_info?: {
    display_phone_number?: string
    verified_name?: string
  }
  registered?: boolean
  subscribed?: boolean
}

type SignupPhase =
  | 'idle'
  | 'loading_sdk'
  | 'awaiting_popup'
  | 'exchanging'
  | 'done'
  | 'error'

interface EmbeddedSignupButtonProps {
  className?: string
  /** Called after credentials are persisted server-side. */
  onSuccess?: (result: EmbeddedSignupSuccess) => void
  onError?: (message: string) => void
  disabled?: boolean
}

interface WaEmbeddedSignupMessage {
  type?: string
  event?: string
  data?: {
    waba_id?: string
    phone_number_id?: string
    current_step?: string
  }
}

function getPublicMetaConfig(): {
  appId: string | null
  configId: string | null
} {
  return {
    appId: process.env.NEXT_PUBLIC_META_APP_ID ?? null,
    configId: process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID ?? null,
  }
}

function loadFacebookSdk(appId: string): Promise<FacebookSDK> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Facebook SDK can only load in the browser'))
  }

  if (window.FB) {
    return Promise.resolve(window.FB)
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk')
    if (existing && window.FB) {
      resolve(window.FB)
      return
    }

    const previousInit = window.fbAsyncInit
    window.fbAsyncInit = () => {
      try {
        previousInit?.()
        window.FB!.init({
          appId,
          cookie: true,
          xfbml: false,
          version: GRAPH_VERSION,
          autoLogAppEvents: false,
        })
        resolve(window.FB!)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('FB.init failed'))
      }
    }

    if (!existing) {
      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = FB_SDK_SRC
      script.async = true
      script.defer = true
      script.onerror = () =>
        reject(new Error('Failed to load the Facebook SDK (network error)'))
      document.body.appendChild(script)
    }
  })
}

function parseSessionMessage(raw: unknown): EmbeddedSignupSession | null {
  if (typeof raw !== 'string') return null
  let parsed: WaEmbeddedSignupMessage
  try {
    parsed = JSON.parse(raw) as WaEmbeddedSignupMessage
  } catch {
    return null
  }
  if (parsed.type !== 'WA_EMBEDDED_SIGNUP') return null
  if (parsed.event === 'CANCEL' || parsed.event === 'cancel') {
    throw new Error('EMBEDDED_SIGNUP_CANCELLED')
  }
  // FINISH / FINISH_ONLY_WABA / finish variants all carry IDs when successful.
  const wabaId = parsed.data?.waba_id?.trim()
  const phoneNumberId = parsed.data?.phone_number_id?.trim()
  if (!wabaId) return null
  return {
    wabaId,
    phoneNumberId: phoneNumberId ?? '',
  }
}

function waitForSessionInfo(
  signal: AbortSignal,
): Promise<EmbeddedSignupSession> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Embedded Signup aborted'))
      return
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(
        new Error(
          'Timed out waiting for WhatsApp account details from Meta. Retry the connection.',
        ),
      )
    }, SESSION_INFO_TIMEOUT_MS)

    const onMessage = (event: MessageEvent) => {
      if (!FB_ORIGINS.has(event.origin)) return
      try {
        const session = parseSessionMessage(event.data)
        if (!session) return
        cleanup()
        resolve(session)
      } catch (err) {
        cleanup()
        if (err instanceof Error && err.message === 'EMBEDDED_SIGNUP_CANCELLED') {
          reject(new Error('Connection cancelled in the Meta popup.'))
          return
        }
        reject(err instanceof Error ? err : new Error('Invalid session info'))
      }
    }

    const onAbort = () => {
      cleanup()
      reject(new Error('Embedded Signup aborted'))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      signal.removeEventListener('abort', onAbort)
    }

    window.addEventListener('message', onMessage)
    signal.addEventListener('abort', onAbort)
  })
}

function fbLoginForCode(
  fb: FacebookSDK,
  configId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      fb.login(
        (response) => {
          if (!response?.authResponse) {
            reject(new Error('Connection cancelled in the Meta popup.'))
            return
          }
          const code = response.authResponse.code
          if (!code) {
            reject(
              new Error(
                'Meta did not return an authorization code. Check that the Login for Business config uses response_type=code.',
              ),
            )
            return
          }
          resolve(code)
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          // Permissions are primarily driven by the Login for Business
          // configuration; listed here for clarity / older configs.
          scope:
            'whatsapp_business_management,whatsapp_business_messaging,business_management',
          extras: {
            setup: {},
            featureType: '',
            sessionInfoVersion: '3',
          },
        },
      )
    } catch (err) {
      reject(err instanceof Error ? err : new Error('FB.login failed'))
    }
  })
}

export function EmbeddedSignupButton({
  className,
  onSuccess,
  onError,
  disabled = false,
}: EmbeddedSignupButtonProps) {
  const [phase, setPhase] = useState<SignupPhase>('idle')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const reportError = useCallback(
    (message: string) => {
      setPhase('error')
      onError?.(message)
      toast.error(message, { duration: 10_000 })
    },
    [onError],
  )

  const handleConnect = useCallback(async () => {
    const { appId, configId } = getPublicMetaConfig()
    if (!appId || !configId) {
      reportError(
        'Embedded Signup is not configured. Set NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID.',
      )
      return
    }

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    try {
      setPhase('loading_sdk')
      const fb = await loadFacebookSdk(appId)

      // Listen before opening the popup so the WA_EMBEDDED_SIGNUP
      // postMessage is never missed. Code + session arrive on different
      // channels and must both succeed.
      setPhase('awaiting_popup')
      const sessionPromise = waitForSessionInfo(abort.signal)
      const codePromise = fbLoginForCode(fb, configId).catch((err) => {
        abort.abort()
        throw err
      })

      const [code, session] = await Promise.all([codePromise, sessionPromise])

      if (!session.wabaId) {
        reportError(
          'Meta did not return a WABA ID. Close any blockers and try again.',
        )
        return
      }

      setPhase('exchanging')
      // Code TTL is ~30s — exchange immediately.
      const res = await fetch('/api/whatsapp/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: session.wabaId,
          phone_number_id: session.phoneNumberId || undefined,
        }),
      })

      let payload: EmbeddedSignupSuccess & { error?: string }
      try {
        payload = (await res.json()) as EmbeddedSignupSuccess & {
          error?: string
        }
      } catch {
        throw new Error('Server returned a non-JSON response')
      }

      if (!res.ok) {
        throw new Error(payload.error || `OAuth exchange failed (${res.status})`)
      }

      setPhase('done')
      toast.success(
        payload.phone_info?.verified_name
          ? `WhatsApp connected — ${payload.phone_info.verified_name}`
          : 'WhatsApp Business account connected',
      )
      onSuccess?.(payload)
    } catch (err) {
      if (abort.signal.aborted) return
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected error during Embedded Signup'
      // User closed the popup — soft message, not a scary failure.
      if (/cancelled/i.test(message)) {
        setPhase('idle')
        toast.message(message)
        onError?.(message)
        return
      }
      console.error('[EmbeddedSignup]', err)
      reportError(message)
    }
  }, [onError, onSuccess, reportError])

  const busy =
    phase === 'loading_sdk' ||
    phase === 'awaiting_popup' ||
    phase === 'exchanging'

  const label =
    phase === 'loading_sdk'
      ? 'Loading Meta…'
      : phase === 'awaiting_popup'
        ? 'Complete signup in the popup…'
        : phase === 'exchanging'
          ? 'Saving credentials…'
          : 'Connect with WhatsApp'

  return (
    <Button
      type="button"
      onClick={handleConnect}
      disabled={disabled || busy}
      className={cn(
        'bg-[#25D366] text-white hover:bg-[#1ebe57] focus-visible:ring-[#25D366]/50',
        className,
      )}
      size="lg"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MessageCircle className="size-4" />
      )}
      {label}
    </Button>
  )
}
