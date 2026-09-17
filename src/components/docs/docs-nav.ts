export type DocsNavItem = {
  href: string;
  label: string;
  description: string;
};

export const docsNavItems: DocsNavItem[] = [
  {
    href: "/docs/primeros-pasos",
    label: "Primeros Pasos",
    description: "Configura tu concesionario y da de alta al equipo.",
  },
  {
    href: "/docs/embudo-de-ventas",
    label: "Embudo de Ventas",
    description: "Organiza oportunidades desde el lead hasta la entrega.",
  },
  {
    href: "/docs/gestion-de-contactos",
    label: "Gestión de Contactos",
    description: "Centraliza clientes, historial y seguimiento comercial.",
  },
];
