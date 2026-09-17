import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeCodeForBusinessToken,
  exchangeForLongLivedToken,
  listWabaPhoneNumbers,
} from './oauth'

const APP_ID = 'test-app-id'
const APP_SECRET = 'test-app-secret'

describe('whatsapp/oauth', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_ID', APP_ID)
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('exchangeCodeForBusinessToken', () => {
    it('exchanges an authorization code for a business access token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'EAABIZ_TOKEN',
          token_type: 'bearer',
          expires_in: 5_184_000,
        }),
      } as Response)

      const result = await exchangeCodeForBusinessToken('auth-code-xyz')

      expect(result).toEqual({
        accessToken: 'EAABIZ_TOKEN',
        tokenType: 'bearer',
        expiresIn: 5_184_000,
      })

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain('/oauth/access_token')
      expect(calledUrl).toContain(`client_id=${APP_ID}`)
      expect(calledUrl).toContain(`client_secret=${APP_SECRET}`)
      expect(calledUrl).toContain('code=auth-code-xyz')
    })

    it('surfaces Meta error messages from a failed exchange', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Invalid verification code format', code: 100 },
        }),
      } as Response)

      await expect(exchangeCodeForBusinessToken('bad')).rejects.toThrow(
        'Invalid verification code format',
      )
    })

    it('throws when Meta credentials are missing', async () => {
      vi.stubEnv('META_APP_ID', '')
      vi.stubEnv('META_APP_SECRET', '')
      vi.stubEnv('NEXT_PUBLIC_META_APP_ID', '')

      await expect(exchangeCodeForBusinessToken('code')).rejects.toThrow(
        /META_APP_ID/,
      )
      expect(fetch).not.toHaveBeenCalled()
    })

    it('falls back to NEXT_PUBLIC_META_APP_ID when META_APP_ID is unset', async () => {
      vi.stubEnv('META_APP_ID', '')
      vi.stubEnv('NEXT_PUBLIC_META_APP_ID', 'public-app-id')
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'TOK' }),
      } as Response)

      await exchangeCodeForBusinessToken('c')
      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain('client_id=public-app-id')
    })

    it('wraps network failures', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'))

      await expect(exchangeCodeForBusinessToken('c')).rejects.toThrow(
        /Failed to reach Meta OAuth endpoint/,
      )
    })
  })

  describe('exchangeForLongLivedToken', () => {
    it('calls fb_exchange_token grant', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'LONG_LIVED',
          expires_in: 5_184_000,
        }),
      } as Response)

      const result = await exchangeForLongLivedToken('SHORT')
      expect(result.accessToken).toBe('LONG_LIVED')

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
      expect(calledUrl).toContain('grant_type=fb_exchange_token')
      expect(calledUrl).toContain('fb_exchange_token=SHORT')
    })
  })

  describe('listWabaPhoneNumbers', () => {
    it('returns phone numbers for a WABA', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: '1099887766',
              display_phone_number: '+57 300 123 4567',
              verified_name: 'Concesionario Demo',
            },
          ],
        }),
      } as Response)

      const phones = await listWabaPhoneNumbers({
        wabaId: 'waba-1',
        accessToken: 'TOK',
      })

      expect(phones).toHaveLength(1)
      expect(phones[0].id).toBe('1099887766')

      const [url, init] = vi.mocked(fetch).mock.calls[0] as [
        string,
        RequestInit,
      ]
      expect(url).toContain('/waba-1/phone_numbers')
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer TOK',
      })
    })
  })
})
