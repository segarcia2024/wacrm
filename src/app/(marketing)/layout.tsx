import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "REVIO — CRM automotriz para concesionarios",
  description:
    "Pipeline de ventas, inbox de WhatsApp y automatizaciones diseñadas para concesionarios. Cierre más negocios con un CRM hecho para el ritmo del piso de ventas.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "REVIO — CRM automotriz para concesionarios",
    description:
      "Velocidad en WhatsApp, pipeline estructurado y flujos pensados para concesionarios.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {children}
    </div>
  );
}
