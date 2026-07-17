"use client";

import { Coins } from "lucide-react";

import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currency";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Deals settings — currency is fixed to COP for the Colombian DMS.
 * Values are always whole pesos (no centavos).
 */
export function DealsSettings() {
  const t = useTranslations("Settings.deals");
  const cop = CURRENCIES[0];

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            {t("defaultCurrency")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t("defaultCurrencyDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              {DEFAULT_CURRENCY} — {cop.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Todos los deals, totales de pipeline y reportes operan en pesos
              colombianos enteros. No se admiten otras divisas ni decimales.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
