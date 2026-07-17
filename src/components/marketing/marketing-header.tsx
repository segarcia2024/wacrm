import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const navLinks = [
  { href: "#caracteristicas", label: "Características" },
  { href: "#precios", label: "Precios" },
] as const;

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
            R
          </span>
          <span className="text-base sm:text-lg">REVIO</span>
        </Link>

        <nav
          aria-label="Principal"
          className="hidden items-center gap-6 text-sm text-muted-foreground md:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Iniciar sesión
          </Link>
          <Link
            href="/signup"
            className={buttonVariants({ size: "sm" })}
          >
            Probar gratis
          </Link>
        </div>
      </div>
    </header>
  );
}
