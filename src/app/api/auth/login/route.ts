import { NextResponse } from "next/server";

import { isSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

interface LoginBody {
  email?: unknown;
  password?: unknown;
  inviteToken?: unknown;
  redirectTo?: unknown;
}

function resolveRedirect(body: LoginBody): string {
  const inviteToken =
    typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";
  const redirectTo =
    typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";

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
    const body = (await request.json().catch(() => null)) as LoginBody | null;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios." },
        { status: 400 },
      );
    }

    const { supabase, applyCookiesTo } = await createRouteHandlerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const redirectTo = resolveRedirect(body ?? {});
    return applyCookiesTo(NextResponse.json({ redirectTo }));
  } catch (err) {
    console.error("[auth/login] unexpected error:", err);
    return NextResponse.json(
      { error: "No se pudo iniciar sesión. Intente de nuevo." },
      { status: 500 },
    );
  }
}
