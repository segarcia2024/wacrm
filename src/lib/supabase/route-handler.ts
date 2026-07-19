import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Supabase client for Route Handlers where auth cookies must be written
 * onto the outgoing NextResponse (not only via cookies()).
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();
  let cookieCarrier = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Ignored when called from a Server Component context.
            }
            cookieCarrier.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const applyCookiesTo = <T extends NextResponse>(response: T): T => {
    cookieCarrier.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  return { supabase, applyCookiesTo };
}
