import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  getClientWompiEnvironment,
  WOMPI_SANDBOX_TEST_CARDS,
} from "@/lib/billing/wompi-config";

export function WompiSandboxPanel() {
  if (getClientWompiEnvironment() !== "sandbox") {
    return null;
  }

  return (
    <Alert className="border-info/40 bg-info-soft/40">
      <AlertTitle className="flex items-center gap-2">
        Modo Sandbox Wompi
        <Badge variant="secondary">Pruebas</Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3 text-sm">
        <p>
          Las transacciones son simuladas: no se mueve dinero real. Use las
          tarjetas de prueba oficiales de Wompi en el widget.
        </p>
        <ul className="space-y-2">
          {WOMPI_SANDBOX_TEST_CARDS.map((card) => (
            <li
              key={card.number}
              className="rounded-lg border border-border/60 bg-background/60 px-3 py-2"
            >
              <p className="font-medium text-foreground">
                {card.label}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  ({card.status})
                </span>
              </p>
              <p className="font-mono text-sm">{card.number}</p>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Llaves requeridas:{" "}
          <code className="rounded bg-muted px-1">pub_test_…</code> y{" "}
          <code className="rounded bg-muted px-1">test_integrity_…</code> desde
          el panel de comercios Wompi → Desarrolladores.
        </p>
      </AlertDescription>
    </Alert>
  );
}
