import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">REVIO</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              CRM automotriz para concesionarios que venden por WhatsApp y
              necesitan un pipeline claro.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href="/login"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Crear cuenta
            </Link>
            <a
              href="#precios"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Precios
            </a>
          </div>
        </div>
        <Separator className="my-6" />
        <p className="text-xs text-muted-foreground">
          © {year} REVIO. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
