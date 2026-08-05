import { describe, expect, it } from "vitest";
import {
  dealPayloadFromVehicle,
  titleFromVehicle,
} from "@/lib/vehicles/deal-vehicle";
import { VEHICLE_TITLE_SEPARATOR } from "@/lib/deals/vehicle-title";
import type { Vehicle } from "@/types";

const sample: Vehicle = {
  id: "v1",
  account_id: "a1",
  user_id: "u1",
  plate: "ABC123",
  make: "MAZDA",
  model: "3",
  year: 2018,
  price: 45_000_000,
  status: "available",
  created_at: "2026-01-01T00:00:00Z",
};

describe("titleFromVehicle", () => {
  it("builds MARCA MODELO – AÑO", () => {
    expect(titleFromVehicle(sample)).toBe(
      `MAZDA 3${VEHICLE_TITLE_SEPARATOR}2018`,
    );
  });
});

describe("dealPayloadFromVehicle", () => {
  it("links vehicle id, title and list price", () => {
    expect(dealPayloadFromVehicle(sample)).toEqual({
      vehicle_id: "v1",
      title: `MAZDA 3${VEHICLE_TITLE_SEPARATOR}2018`,
      value: 45_000_000,
    });
  });
});
