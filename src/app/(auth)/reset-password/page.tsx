'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'

import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

const MIN_PASSWORD = 8

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      setHasSession(!!user)
      setChecking(false)
    })()

    return () => {
      cancelled = true
    }
    // createClient() is a module singleton — safe to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setSuccess(true)
      // Breve pausa para que el usuario vea el éxito, luego al CRM.
      window.setTimeout(() => {
        router.replace('/dashboard')
        router.refresh()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-xl text-foreground">
              Enlace inválido o expirado
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Solicita un nuevo enlace de restablecimiento. Los enlaces solo
              funcionan una vez y caducan en poco tiempo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/forgot-password">
              <Button className="w-full">Solicitar nuevo enlace</Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                className="w-full border-border text-muted-foreground"
              >
                Volver a iniciar sesión
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl text-foreground">
              Contraseña actualizada
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Redirigiendo al panel…
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo width={220} height={70} className="h-14 w-auto" />
          </div>
          <CardTitle className="text-xl text-foreground">
            Nueva contraseña
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Elige una contraseña segura para tu cuenta REVIO
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-muted-foreground">
                Nueva contraseña
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm" className="text-muted-foreground">
                Confirmar contraseña
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar contraseña'
              )}
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a iniciar sesión
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
