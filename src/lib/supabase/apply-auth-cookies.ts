import type { NextResponse } from "next/server";

export type AuthCookieToSet = {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
};

/**
 * Write auth cookies onto a NextResponse with an explicit Path=/.
 *
 * Copying via `response.cookies.getAll()` → `set(cookie)` can drop
 * attributes. On `/api/auth/login` a missing Path scopes the session
 * to `/api/auth`, so the next navigation to /dashboard has no cookie
 * and the user bounces back to login.
 */
export function applyAuthCookies<T extends NextResponse>(
  response: T,
  cookiesToSet: AuthCookieToSet[],
): T {
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      path: options?.path ?? "/",
      sameSite: options?.sameSite ?? "lax",
      httpOnly: options?.httpOnly ?? false,
      ...(options?.maxAge != null ? { maxAge: options.maxAge } : {}),
      ...(options?.expires ? { expires: options.expires } : {}),
      ...(options?.secure != null ? { secure: options.secure } : {}),
      ...(options?.domain ? { domain: options.domain } : {}),
    });
  }
  return response;
}
