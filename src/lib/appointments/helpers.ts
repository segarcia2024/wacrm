/**
 * Appointment helpers — titles, reminder copy, due-window checks.
 */

import type { AppointmentType } from "@/types";

export const APPOINTMENT_TYPES: AppointmentType[] = [
  "showroom",
  "test_drive",
  "call",
  "delivery",
  "other",
];

export const DEFAULT_DURATION_MINUTES = 60;

/** Reminder fires once the appointment is within this many ms. */
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export function isAppointmentReminderDue(
  startsAtIso: string,
  now = new Date(),
): boolean {
  const starts = new Date(startsAtIso).getTime();
  if (!Number.isFinite(starts)) return false;
  const msUntil = starts - now.getTime();
  return msUntil > 0 && msUntil <= REMINDER_LEAD_MS;
}

export function buildClientReminderText(args: {
  contactName?: string | null;
  typeLabel: string;
  whenLabel: string;
  location?: string | null;
}): string {
  const name = (args.contactName ?? "").trim();
  const greeting = name ? `Hola ${name}` : "Hola";
  const place = args.location?.trim()
    ? `\nLugar: ${args.location.trim()}`
    : "";
  return (
    `${greeting}, te recordamos tu cita (${args.typeLabel}) ` +
    `el ${args.whenLabel}.${place}\n` +
    `Si necesitas reagendar, escríbenos por este chat.`
  );
}

export function buildAgentReminderTitle(typeLabel: string): string {
  return `Recordatorio de cita: ${typeLabel}`;
}

export function buildAgentReminderBody(args: {
  contactLabel: string;
  whenLabel: string;
  location?: string | null;
}): string {
  const place = args.location?.trim()
    ? ` · ${args.location.trim()}`
    : "";
  return `${args.contactLabel} · ${args.whenLabel}${place}`;
}

/** Start of local week (Monday). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
