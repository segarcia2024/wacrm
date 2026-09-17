import { NextResponse } from "next/server";
import { z } from "zod";

import { isSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { getClientIp } from "@/lib/http/client-ip";
import { parseJsonBody } from "@/lib/http/parse-body";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

const loginBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
  inviteToken: z.string().trim().max(512).optional(),
  redirectTo: z.string().max(2048).optional(),
});

/** Generic 401 — never echo Supabase auth messages (enumeration / fingerprinting). */
const INVALID_CREDENTIALS = "Email o contraseña incorrectos.";

function resolveRedirect(body: z.infer<typeof loginBodySchema>): string {
  const inviteToken = body.inviteToken?.trim() ?? "";
  const redirectTo = body.redirectTo?.trim() ?? "";

  if (inviteToken) {
    return `/join/${encodeURIComponent(inviteToken)}`;
  }
  if (redirectTo && isSafeRedirectPath(redirectTo)) {
    return redirectTo;
  }
  return "/dashboard";
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit(`login:ip:${ip}`, RATE_LIMITS.authLogin);
    if (!ipLimit.success) return rateLimitResponse(ipLimit);

    const parsed = await parseJsonBody(request, loginBodySchema);
    if (!parsed.ok) {
      // Avoid leaking which field failed for credential stuffing probes —
      // only distinguish missing/empty credentials with a fixed Spanish copy.
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios." },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    const emailLimit = await checkRateLimit(
      `login:email:${email.toLowerCase()}`,
      RATE_LIMITS.authLoginEmail,
    );
    if (!emailLimit.success) return rateLimitResponse(emailLimit);

    const { supabase, applyCookiesTo } = await createRouteHandlerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const redirectTo = resolveRedirect(parsed.data);
    return applyCookiesTo(NextResponse.json({ redirectTo }));
  } catch (err) {
    console.error("[auth/login] unexpected error:", err);
    return NextResponse.json(
      { error: "No se pudo iniciar sesión. Intente de nuevo." },
      { status: 500 },
    );
  }
}
