/**
 * Helpers for vehicle inventory — plate normalization, labels, validation.
 */

import { isValidVehicleYear } from "@/lib/deals/vehicle-title";
import type { VehicleStatus } from "@/types";

export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
  "available",
  "reserved",
  "sold",
] as const;

/** Uppercase plate without spaces/dashes (e.g. "abc 123" → "ABC123"). */
export function normalizeVehiclePlate(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

/** True when plate has at least 5 alphanumeric chars after normalize. */
export function isValidVehiclePlate(raw: string): boolean {
  const plate = normalizeVehiclePlate(raw);
  return plate.length >= 5 && /^[A-Z0-9]+$/.test(plate);
}

export interface VehicleLabelParts {
  plate?: string | null;
  make: string;
  model: string;
  year: string | number;
}

/** Display label: `ABC123 · MAZDA 3 – 2018` (plate optional). */
export function buildVehicleLabel(parts: VehicleLabelParts): string {
  const make = String(parts.make ?? "").trim().toUpperCase();
  const model = String(parts.model ?? "").trim().toUpperCase();
  const year = String(parts.year ?? "").trim();
  const plate = parts.plate ? normalizeVehiclePlate(parts.plate) : "";

  if (!make || !model || !year) return "";

  const core = `${make} ${model} – ${year}`;
  return plate ? `${plate} · ${core}` : core;
}

export function parseMileage(
  raw: string | number | null | undefined,
): number | null {
  if (raw === "" || raw == null) return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw).replace(/\D/g, ""), 10);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function isValidVehicleMileage(
  raw: string | number | null | undefined,
): boolean {
  if (raw === "" || raw == null) return true;
  return parseMileage(raw) !== null;
}

export { isValidVehicleYear };
