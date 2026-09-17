/**
 * Build an Excel-friendly CSV for the contacts dump.
 * UTF-8 BOM + semicolon so Excel (es-CO) opens columns correctly.
 */

import {
  formatWhatsAppUsername,
  visiblePhone,
} from "@/lib/contacts/display";
import type { AssignedVehicleSummary } from "@/lib/contacts/assigned-vehicle";

export const CONTACT_EXPORT_HEADERS = [
  "Nombre",
  "Teléfono",
  "Usuario WhatsApp",
  "Correo",
  "Empresa",
  "Etiquetas",
  "Vehículo",
  "Placa",
  "Marca",
  "Modelo",
  "Año",
  "Comercial",
  "Estado negocio",
  "Creado",
] as const;

export function dealStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "won":
      return "Ganado";
    case "lost":
      return "Perdido";
    case "open":
      return "Abierto";
    default:
      return status?.trim() || "";
  }
}

export interface ContactExportInput {
  name?: string | null;
  phone?: string | null;
  username?: string | null;
  email?: string | null;
  company?: string | null;
  tags?: string[];
  created_at: string;
  assigned?: AssignedVehicleSummary | null;
}

export function contactToExportRow(contact: ContactExportInput): string[] {
  const assigned = contact.assigned;
  const extra =
    assigned && assigned.extraCount > 0 ? ` (+${assigned.extraCount})` : "";
  return [
    contact.name?.trim() ?? "",
    visiblePhone(contact.phone),
    formatWhatsAppUsername(contact.username),
    contact.email?.trim() ?? "",
    contact.company?.trim() ?? "",
    (contact.tags ?? []).join(", "),
    assigned ? `${assigned.label}${extra}` : "",
    assigned?.plate ?? "",
    assigned?.make ?? "",
    assigned?.model ?? "",
    assigned?.year ?? "",
    assigned?.agentName ?? "",
    assigned ? dealStatusLabel(assigned.dealStatus) : "",
    contact.created_at.slice(0, 10),
  ];
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** RFC 4180 CSV with `;` separator and UTF-8 BOM for Excel. */
export function toCsv(rows: string[][]): string {
  const body = rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
  return `\uFEFF${body}`;
}

export function buildContactsWorkbook(contacts: ContactExportInput[]): string {
  const rows = [
    [...CONTACT_EXPORT_HEADERS],
    ...contacts.map(contactToExportRow),
  ];
  return toCsv(rows);
}
