import { CarFront, Gauge, GitBranchPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Gauge,
    title: "Velocidad en cada conversación",
    description:
      "Inbox compartido de WhatsApp con respuestas rápidas y contexto del cliente al instante. Menos espera, más citas de prueba y cotizaciones enviadas.",
    accent: "text-info",
    iconBg: "bg-info-soft",
  },
  {
    icon: GitBranchPlus,
    title: "Pipeline estructurado",
    description:
      "Etapas claras desde el primer contacto hasta el cierre. Cada asesor sabe qué hacer y usted ve dónde se estancan los negocios.",
    accent: "text-primary",
    iconBg: "bg-primary-soft",
  },
  {
    icon: CarFront,
    title: "Enfoque automotriz",
    description:
      "Flujos y métricas pensados para concesionarios: seguimiento de interesados, crédito, test drive y entrega — no un CRM genérico adaptado a la fuerza.",
    accent: "text-brand-secondary",
    iconBg: "bg-success-soft",
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="caracteristicas"
      className="scroll-mt-20 border-t border-border bg-card/20 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Diseñado para el ritmo del concesionario
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground sm:text-lg">
            Tres pilares que separan un CRM genérico de una herramienta que su
            equipo realmente usa en el piso de ventas.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <li key={feature.title}>
              <Card className="h-full border-border/80 bg-card transition-colors hover:border-primary/30">
                <CardHeader>
                  <div
                    className={`mb-2 flex size-10 items-center justify-center rounded-lg ${feature.iconBg}`}
                  >
                    <feature.icon className={`size-5 ${feature.accent}`} />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="sr-only">
                  {feature.title}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
