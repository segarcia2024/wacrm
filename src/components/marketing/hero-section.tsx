import Link from "next/link";
import { ArrowRight, CarFront } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,var(--primary-soft-2),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1">
            <CarFront className="size-3.5" />
            CRM para concesionarios
          </Badge>

          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Cierre más vehículos con un pipeline que{" "}
            <span className="text-primary">no frena</span> a su equipo de ventas
          </h1>

          <p className="mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:mt-6 sm:text-lg">
            REVIO unifica WhatsApp, seguimiento comercial y etapas del
            concesionario en un solo lugar. Sus asesores responden más rápido y
            usted ve cada negocio avanzar sin perder el control.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-10 px-5",
              )}
            >
              Empezar ahora
              <ArrowRight data-icon="inline-end" />
            </Link>
            <a
              href="#precios"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 px-5",
              )}
            >
              Ver planes
            </a>
          </div>

          <p className="mt-4 text-xs text-muted-foreground sm:text-sm">
            Sin tarjeta para la prueba · Facturación en COP · Hecho para el
            piso de ventas
          </p>
        </div>
      </div>
    </section>
  );
}
