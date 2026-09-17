import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gestión de Contactos",
  description:
    "Centraliza clientes, historial y seguimiento comercial en REVIO.",
};

export default function GestionDeContactosPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-primary">
      <p className="not-prose mb-2 text-sm font-medium text-primary">
        <Link
          href="/docs"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Documentación
        </Link>
        <span className="mx-2 text-border">/</span>
        Gestión de Contactos
      </p>

      <h1>Gestión de Contactos</h1>
      <p className="lead">
        Esta guía estará disponible pronto. Mientras tanto, comienza por{" "}
        <Link href="/docs/primeros-pasos">Primeros Pasos</Link> para dejar
        lista la estructura base de tu concesionario.
      </p>
    </article>
  );
}
