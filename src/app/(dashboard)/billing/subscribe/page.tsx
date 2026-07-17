import { PricingTable } from "@/components/marketing/pricing-table";
import { WompiSandboxPanel } from "@/components/billing/wompi-sandbox-panel";

export default function BillingSubscribePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contratar licencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Active asientos para su equipo de asesores. El pago se procesa de
          forma segura con Wompi.
        </p>
      </div>
      <WompiSandboxPanel />
      <PricingTable />
    </div>
  );
}
