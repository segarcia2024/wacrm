"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { docsNavItems } from "@/components/docs/docs-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentación" className={cn("space-y-1", className)}>
      <p className="mb-3 px-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Guías
      </p>
      {docsNavItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "block rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-4 py-4">
        <Link href="/docs" className="inline-flex items-center gap-2.5">
          <BrandLogo variant="icon" width={28} height={28} />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-sidebar-foreground">
              REVIO Docs
            </p>
            <p className="text-xs text-muted-foreground">Centro de ayuda</p>
          </div>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">{children}</div>
      <div className="border-t border-sidebar-border px-4 py-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BookOpen className="size-4" />
          Ir al CRM
        </Link>
      </div>
    </div>
  );
}

export function DocsSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarChrome>
          <NavLinks />
        </SidebarChrome>
      </aside>

      {/* Mobile top bar + sheet */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/docs" className="inline-flex items-center gap-2">
          <BrandLogo variant="icon" width={24} height={24} />
          <span className="text-sm font-semibold">REVIO Docs</span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Abrir menú de documentación"
              />
            }
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-72 bg-sidebar p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navegación de documentación</SheetTitle>
            </SheetHeader>
            <SidebarChrome>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SidebarChrome>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
