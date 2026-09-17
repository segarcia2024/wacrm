import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { Database } from "@/types/database";

import {
  applyAuthCookies,
  type AuthCookieToSet,
} from "./apply-auth-cookies";

/**
 * Supabase client for Route Handlers where auth cookies must be written
 * onto the outgoing NextResponse (not only via cookies()).
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();
  const pending: AuthCookieToSet[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((cookie) => {
            const sameSite = cookie.options?.sameSite;
            pending.push({
              name: cookie.name,
              value: cookie.value,
              options: {
                ...cookie.options,
                sameSite:
                  sameSite === true
                    ? "strict"
                    : sameSite === false
                      ? undefined
                      : sameSite,
              },
            });
            try {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            } catch {
              // Ignored when called from a Server Component context.
            }
          });
        },
      },
    },
  );

  const applyCookiesTo = <T extends NextResponse>(response: T): T =>
    applyAuthCookies(response, pending);

  return { supabase: supabase as unknown as SupabaseClient, applyCookiesTo };
}
