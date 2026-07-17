"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import {
  ADVISOR_MONTHLY_PRICE_COP,
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  calculateDiscountedMonthlyPriceCOP,
  calculateSubscriptionTotalCOP,
  getBillingCycleDiscountPercent,
  MAX_SEATS_PER_CHECKOUT,
  type BillingCycleMonths,
} from "@/lib/billing/pricing";
import {
  BILLING_SUBSCRIBE_PATH,
  CheckoutRequestError,
  createSubscriptionCheckout,
  openWompiCheckout,
} from "@/lib/billing/create-subscription-checkout";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

function formatCOP(value: number): string {
  return copFormatter.format(value);
}

const planFeatures = [
  "Inbox de WhatsApp compartido",
  "Pipeline comercial ilimitado",
  "Contactos y etiquetas automotrices",
  "Automatizaciones y respuestas rápidas",
  "Soporte por correo en horario laboral",
] as const;

export function PricingTable() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [seats, setSeats] = useState(1);
  const [billingCycle, setBillingCycle] = useState<BillingCycleMonths>(1);

  const discountPercent = getBillingCycleDiscountPercent(billingCycle);
  const hasDiscount = discountPercent > 0;
  const discountedMonthlyPrice = useMemo(
    () => calculateDiscountedMonthlyPriceCOP(billingCycle),
    [billingCycle],
  );
  const totalToday = useMemo(
    () => calculateSubscriptionTotalCOP(seats, billingCycle),
    [seats, billingCycle],
  );

  const decrementSeats = useCallback(() => {
    setSeats((current) => Math.max(1, current - 1));
  }, []);

  const incrementSeats = useCallback(() => {
    setSeats((current) => Math.min(MAX_SEATS_PER_CHECKOUT, current + 1));
  }, []);

  const handleSubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(
          `/login?redirect=${encodeURIComponent(BILLING_SUBSCRIBE_PATH)}`,
        );
        return;
      }

      const payload = await createSubscriptionCheckout({
        seats,
        billingCycle,
      });

      await openWompiCheckout(payload);
    } catch (error) {
      if (error instanceof CheckoutRequestError) {
        if (error.status === 401) {
          router.push(
            `/login?redirect=${encodeURIComponent(BILLING_SUBSCRIBE_PATH)}`,
          );
          return;
        }
        if (error.status === 403) {
          toast.error("Permisos insuficientes", {
            description:
              "Solo un administrador del concesionario puede contratar licencias.",
          });
          return;
        }
        toast.error("No pudimos iniciar el pago", {
          description: error.message,
        });
        return;
      }

      toast.error("No pudimos iniciar el pago", {
        description:
          error instanceof Error
            ? error.message
            : "Intente de nuevo en unos minutos.",
      });
    } finally {
      setLoading(false);
    }
  }, [router, seats, billingCycle]);

  return (
    <Card className="mx-auto w-full max-w-xl border-primary/25 bg-card shadow-lg shadow-primary/5">
      <CardHeader className="items-center text-center">
        <Badge variant="secondary" className="mb-2">
          Plan recomendado
        </Badge>
        <CardTitle className="text-xl sm:text-2xl">Asesor</CardTitle>
        <CardDescription>
          Calcule el costo de su equipo según usuarios y ciclo de facturación
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Usuarios (asesores)</p>
            <span className="text-xs text-muted-foreground">
              Mínimo 1 · Máximo {MAX_SEATS_PER_CHECKOUT}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={decrementSeats}
              disabled={loading || seats <= 1}
              aria-label="Reducir usuarios"
            >
              <Minus className="size-4" />
            </Button>
            <div className="flex min-w-16 flex-col items-center">
              <span className="text-3xl font-bold tabular-nums">{seats}</span>
              <span className="text-xs text-muted-foreground">
                {seats === 1 ? "usuario" : "usuarios"}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              onClick={incrementSeats}
              disabled={loading || seats >= MAX_SEATS_PER_CHECKOUT}
              aria-label="Aumentar usuarios"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Ciclo de facturación</p>
          <Tabs
            value={String(billingCycle)}
            onValueChange={(value) =>
              setBillingCycle(Number(value) as BillingCycleMonths)
            }
            className="w-full"
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4">
              {BILLING_CYCLES.map((cycle) => {
                const cycleDiscount = getBillingCycleDiscountPercent(cycle);
                return (
                  <TabsTrigger
                    key={cycle}
                    value={String(cycle)}
                    disabled={loading}
                    className="flex h-auto min-h-10 flex-col gap-0.5 py-2 text-xs sm:text-sm"
                  >
                    <span>{BILLING_CYCLE_LABELS[cycle]}</span>
                    {cycleDiscount > 0 ? (
                      <span className="text-[10px] font-normal text-success">
                        −{cycleDiscount}%
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
            {hasDiscount ? (
              <span className="text-lg text-muted-foreground line-through">
                {formatCOP(ADVISOR_MONTHLY_PRICE_COP)}
              </span>
            ) : null}
            <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
              {formatCOP(discountedMonthlyPrice)}
            </span>
            <span className="text-sm text-muted-foreground">/ mes por usuario</span>
          </div>
          {hasDiscount ? (
            <p className="mt-2 text-center text-xs text-success">
              Ahorra {discountPercent}% pagando{" "}
              {BILLING_CYCLE_LABELS[billingCycle].toLowerCase()}
            </p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Facturación mensual · COP · por asesor
            </p>
          )}

          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>
                {seats} {seats === 1 ? "usuario" : "usuarios"} ×{" "}
                {billingCycle}{" "}
                {billingCycle === 1 ? "mes" : "meses"}
                {hasDiscount ? ` (−${discountPercent}%)` : ""}
              </span>
              <span className="tabular-nums">{formatCOP(totalToday)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
              <span>Total a pagar hoy</span>
              <span className="text-lg tabular-nums">{formatCOP(totalToday)}</span>
            </div>
          </div>
        </div>

        <ul className="space-y-3 text-sm">
          {planFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="flex-col gap-3 border-t border-border bg-muted/30">
        <Button
          className="h-10 w-full"
          size="lg"
          disabled={loading}
          onClick={handleSubscribe}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Preparando pago…
            </>
          ) : (
            `Contratar por ${formatCOP(totalToday)}`
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Pago seguro vía Wompi. Cancele cuando quiera.
        </p>
      </CardFooter>
    </Card>
  );
}
