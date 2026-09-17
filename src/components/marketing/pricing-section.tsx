"use client";

import { useTranslations } from "next-intl";

import { PricingTable } from "@/components/marketing/pricing-table";

export function PricingSection() {
  const t = useTranslations("Billing.section");

  return (
    <section
      id="precios"
      className="scroll-mt-20 border-t border-border py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </div>

        <div className="mt-8 w-full sm:mt-12 md:mt-14">
          <PricingTable />
        </div>
      </div>
    </section>
  );
}
