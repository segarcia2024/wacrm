/**
 * Minimal typings for the Facebook JS SDK as used by WhatsApp
 * Embedded Signup (FB.init + FB.login with config_id / code).
 */

interface FacebookAuthResponse {
  accessToken?: string
  /** Embedded Signup authorization code (exchange server-side within ~30s). */
  code?: string
  expiresIn?: number
  signedRequest?: string
  userID?: string
}

interface FacebookLoginResponse {
  authResponse?: FacebookAuthResponse | null
  status?: 'connected' | 'not_authorized' | 'unknown'
}

interface FacebookLoginOptions {
  config_id?: string
  response_type?: 'code' | 'token' | 'code%20token'
  override_default_response_type?: boolean
  scope?: string
  return_scopes?: boolean
  extras?: {
    setup?: Record<string, unknown>
    featureType?: string
    sessionInfoVersion?: string
    version?: string
  }
}

interface FacebookInitParams {
  appId: string
  cookie?: boolean
  xfbml?: boolean
  version: string
  autoLogAppEvents?: boolean
}

interface FacebookSDK {
  init: (params: FacebookInitParams) => void
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options?: FacebookLoginOptions,
  ) => void
  AppEvents?: { logPageView?: () => void }
}

interface Window {
  FB?: FacebookSDK
  fbAsyncInit?: () => void
}
