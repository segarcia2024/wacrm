import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
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
          className="flex items-center"
          aria-label="REVIO — inicio"
        >
          <BrandLogo
            priority
            width={176}
            height={56}
            className="h-10 w-auto sm:h-11"
          />
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
