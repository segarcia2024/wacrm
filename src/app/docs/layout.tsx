import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export const metadata: Metadata = {
  title: {
    default: "Documentación",
    template: "%s — Docs REVIO",
  },
  description:
    "Centro de ayuda de REVIO: guías para configurar y operar el CRM automotriz de tu concesionario.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="flex min-h-svh flex-col lg:flex-row">
        <DocsSidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:max-w-4xl lg:px-10 lg:py-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
