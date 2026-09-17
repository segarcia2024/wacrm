import Link from "next/link";
import {
  ArrowRight,
  ContactRound,
  Funnel,
  Rocket,
  Search,
} from "lucide-react";
import { docsNavItems } from "@/components/docs/docs-nav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description:
    "Documentación pública de REVIO: aprende a configurar el CRM, gestionar contactos y operar tu embudo de ventas.",
};

const categoryIcons = {
  "/docs/primeros-pasos": Rocket,
  "/docs/embudo-de-ventas": Funnel,
  "/docs/gestion-de-contactos": ContactRound,
} as const;

export default function DocsHubPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm font-medium text-primary">Documentación</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Centro de ayuda REVIO
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Guías claras para que tu equipo comercial configure el CRM, opere el
          embudo y dé seguimiento a cada oportunidad con el ritmo del piso de
          ventas.
        </p>
      </header>

      {/* Barra de búsqueda visual (simulada) */}
      <div
        className="relative"
        role="search"
        aria-label="Buscar en la documentación"
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          readOnly
          placeholder="Buscar artículos, por ejemplo: embudo, contactos, WhatsApp…"
          aria-label="Buscar en la documentación (próximamente)"
          className="h-12 w-full cursor-default rounded-xl border border-border bg-card px-12 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
          /
        </kbd>
      </div>

      <section aria-labelledby="docs-categories-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2
            id="docs-categories-heading"
            className="text-lg font-semibold text-foreground"
          >
            Categorías principales
          </h2>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Empieza por la guía que necesites
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docsNavItems.map((item) => {
            const Icon =
              categoryIcons[item.href as keyof typeof categoryIcons] ?? Rocket;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="text-base font-semibold text-foreground">
                    {item.label}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    Ver guía
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="rounded-xl border border-border bg-card-2/60 px-5 py-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          ¿Necesitas ayuda con la implementación en tu concesionario?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Inicia sesión
          </Link>{" "}
          o revisa primero{" "}
          <Link
            href="/docs/primeros-pasos"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Primeros Pasos
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}
