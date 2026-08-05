/**
 * Helpers to link inventory vehicles to deals (title + payload).
 */

import { buildVehicleDealTitle } from "@/lib/deals/vehicle-title";
import type { Vehicle } from "@/types";

/** Deal title derived from a stock vehicle (`MARCA MODELO – AÑO`). */
export function titleFromVehicle(vehicle: Vehicle): string {
  return buildVehicleDealTitle({
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
  });
}

export function dealPayloadFromVehicle(vehicle: Vehicle): {
  vehicle_id: string;
  title: string;
  value: number;
} {
  return {
    vehicle_id: vehicle.id,
    title: titleFromVehicle(vehicle),
    value: Math.max(0, Math.round(Number(vehicle.price) || 0)),
  };
}
