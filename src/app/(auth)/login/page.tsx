"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const redirectTo = searchParams.get("redirect");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slowHint, setSlowHint] = useState(false);

  // Prefetch /dashboard only after the user engages the form — eager
  // router.prefetch() injects link preloads that Chrome flags if login
  // takes more than a few seconds.
  useEffect(() => {
    let prefetched = false;
    const prefetchDashboard = () => {
      if (prefetched) return;
      prefetched = true;
      router.prefetch("/dashboard");
    };

    const form = document.getElementById("login-form");
    form?.addEventListener("focusin", prefetchDashboard, { once: true });
    form?.addEventListener("pointerdown", prefetchDashboard, { once: true });

    return () => {
      form?.removeEventListener("focusin", prefetchDashboard);
      form?.removeEventListener("pointerdown", prefetchDashboard);
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSlowHint(false);

    const slowTimer = window.setTimeout(() => {
      setSlowHint(true);
    }, 4000);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          password,
          inviteToken: inviteToken ?? "",
          redirectTo: redirectTo ?? "",
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok || !body) {
        setError(body?.error ?? "No se pudo iniciar sesión.");
        setLoading(false);
        return;
      }

      const target = body.redirectTo ?? "/dashboard";
      // Navegación completa para que las cookies HttpOnly del login lleguen al dashboard.
      window.location.replace(target);
    } catch {
      setError(
        "Error de conexión con el servidor. Verifique que `npm run dev` esté activo.",
      );
      setLoading(false);
    } finally {
      window.clearTimeout(slowTimer);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo
              width={220}
              height={70}
              className="h-14 w-auto"
            />
          </div>
          <CardTitle className="text-xl text-foreground">
            {inviteToken ? t("titleAccept") : t("titleWelcome")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken ? t("descAccept") : t("descWelcome")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="login-form"
            onSubmit={handleLogin}
            className="flex flex-col gap-4"
          >
            {error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t("emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-muted-foreground">
                  {t("passwordLabel")}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t("signingIn") : t("signIn")}
            </Button>

            {loading && slowHint ? (
              <p className="text-center text-xs text-muted-foreground">
                Sesión iniciada. Compilando el panel — la primera carga puede
                tardar 1–2 minutos en desarrollo.
              </p>
            ) : null}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-primary hover:text-primary/80"
            >
              {t("createAccount")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
