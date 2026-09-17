"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  ADVISOR_MONTHLY_PRICE_COP,
  BILLING_CYCLES,
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

export function PricingTable() {
  const t = useTranslations("Billing.pricing");
  const router = useRouter();
  const cycleLabel = (cycle: BillingCycleMonths) => t(`cycle${cycle}`);
  const planFeatures = [
    t("featureInbox"),
    t("featurePipeline"),
    t("featureContacts"),
    t("featureAutomations"),
    t("featureSupport"),
  ] as const;
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
          toast.error(t("insufficientTitle"), {
            description: t("insufficientDesc"),
          });
          return;
        }
        toast.error(t("checkoutFailed"), {
          description: error.message,
        });
        return;
      }

      toast.error(t("checkoutFailed"), {
        description:
          error instanceof Error ? error.message : t("retryLater"),
      });
    } finally {
      setLoading(false);
    }
  }, [router, seats, billingCycle, t]);

  return (
    <Card className="mx-auto w-full max-w-xl overflow-hidden border-primary/25 bg-card shadow-lg shadow-primary/5">
      <CardHeader className="items-center px-4 text-center sm:px-6">
        <Badge variant="secondary" className="mb-2">
          {t("badge")}
        </Badge>
        <CardTitle className="text-xl sm:text-2xl">{t("planName")}</CardTitle>
        <CardDescription className="text-pretty">
          {t("planDescription")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-4 sm:space-y-6 sm:px-6">
        <div className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-sm font-medium">{t("seatsLabel")}</p>
            <span className="text-xs text-muted-foreground">
              {t("seatsRange", { max: MAX_SEATS_PER_CHECKOUT })}
            </span>
          </div>
          <div className="flex items-center justify-center gap-4 sm:gap-5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-full sm:size-9"
              onClick={decrementSeats}
              disabled={loading || seats <= 1}
              aria-label={t("decreaseSeats")}
            >
              <Minus className="size-4" />
            </Button>
            <div className="flex min-w-20 flex-col items-center">
              <span className="text-3xl font-bold tabular-nums leading-none sm:text-4xl">
                {seats}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {seats === 1 ? t("userOne") : t("userMany")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-full sm:size-9"
              onClick={incrementSeats}
              disabled={loading || seats >= MAX_SEATS_PER_CHECKOUT}
              aria-label={t("increaseSeats")}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t("cycleLabel")}</p>
          {/*
            Botones propios en grid (no TabsList): el Tabs de la UI fija
            h-8 en orientación horizontal y hacía desbordar Semestral/Anual
            encima del precio en viewports estrechos.
          */}
          <div
            role="radiogroup"
            aria-label={t("cycleAria")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {BILLING_CYCLES.map((cycle) => {
              const cycleDiscount = getBillingCycleDiscountPercent(cycle);
              const selected = billingCycle === cycle;
              return (
                <button
                  key={cycle}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={loading}
                  onClick={() => setBillingCycle(cycle)}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition-colors",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    "disabled:pointer-events-none disabled:opacity-50",
                    selected
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="text-xs font-medium leading-tight sm:text-sm">
                    {cycleLabel(cycle)}
                  </span>
                  {cycleDiscount > 0 ? (
                    <span className="text-[10px] font-medium leading-none text-success sm:text-[11px]">
                      −{cycleDiscount}%
                    </span>
                  ) : (
                    <span className="text-[10px] font-normal leading-none text-muted-foreground/70 sm:text-[11px]">
                      {t("noDiscount")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <div className="flex flex-col items-center gap-1 text-center sm:gap-1.5">
            {hasDiscount ? (
              <span className="text-sm text-muted-foreground line-through sm:text-base">
                {formatCOP(ADVISOR_MONTHLY_PRICE_COP)}
              </span>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5">
              <span className="text-3xl font-bold tracking-tight tabular-nums sm:text-4xl md:text-5xl">
                {formatCOP(discountedMonthlyPrice)}
              </span>
              <span className="text-xs text-muted-foreground sm:text-sm">
                {t("perMonthUser")}
              </span>
            </div>
          </div>
          {hasDiscount ? (
            <p className="mt-2 text-center text-xs text-success">
              {t("savePaying", {
                percent: discountPercent,
                cycle: cycleLabel(billingCycle).toLowerCase(),
              })}
            </p>
          ) : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {t("monthlyBilling")}
            </p>
          )}

          <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex items-start justify-between gap-3 text-muted-foreground">
              <span className="min-w-0 text-left leading-snug">
                {t("lineItem", {
                  seats,
                  users: seats === 1 ? t("userOne") : t("userMany"),
                  months: billingCycle,
                  monthWord: billingCycle === 1 ? t("monthOne") : t("monthMany"),
                  discount: hasDiscount ? ` (−${discountPercent}%)` : "",
                })}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCOP(totalToday)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 font-semibold text-foreground">
              <span>{t("totalToday")}</span>
              <span className="shrink-0 text-base tabular-nums sm:text-lg">
                {formatCOP(totalToday)}
              </span>
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
              <span className="text-pretty">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="flex-col gap-3 border-t border-border bg-muted/30 px-4 sm:px-6">
        <Button
          className="h-11 w-full sm:h-10"
          size="lg"
          disabled={loading}
          onClick={handleSubscribe}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              {t("preparing")}
            </>
          ) : (
            <span className="truncate">
              {t("subscribe", { amount: formatCOP(totalToday) })}
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("secureNote")}
        </p>
      </CardFooter>
    </Card>
  );
}
