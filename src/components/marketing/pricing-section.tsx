import { PricingTable } from "@/components/marketing/pricing-table";

export function PricingSection() {
  return (
    <section
      id="precios"
      className="scroll-mt-20 border-t border-border py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Un precio claro por asesor
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            Escale su equipo sin sorpresas. Pague solo por los asesores que
            usan REVIO cada mes.
          </p>
        </div>

        <div className="mt-10 sm:mt-14">
          <PricingTable />
        </div>
      </div>
    </section>
  );
}
