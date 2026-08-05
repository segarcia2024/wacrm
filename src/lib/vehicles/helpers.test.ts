import { describe, expect, it } from "vitest";
import {
  buildVehicleLabel,
  isValidVehicleMileage,
  isValidVehiclePlate,
  normalizeVehiclePlate,
  parseMileage,
} from "@/lib/vehicles/helpers";

describe("normalizeVehiclePlate", () => {
  it("uppercases and strips spaces/dashes", () => {
    expect(normalizeVehiclePlate("abc 123")).toBe("ABC123");
    expect(normalizeVehiclePlate("abc-12d")).toBe("ABC12D");
    expect(normalizeVehiclePlate("  XYZ  98A ")).toBe("XYZ98A");
  });
});

describe("isValidVehiclePlate", () => {
  it("accepts plates with 5+ alphanumeric chars", () => {
    expect(isValidVehiclePlate("ABC123")).toBe(true);
    expect(isValidVehiclePlate("abc 12")).toBe(true);
  });

  it("rejects short or invalid plates", () => {
    expect(isValidVehiclePlate("AB12")).toBe(false);
    expect(isValidVehiclePlate("")).toBe(false);
    expect(isValidVehiclePlate("AB@123")).toBe(false);
  });
});

describe("buildVehicleLabel", () => {
  it("builds plate · make model – year", () => {
    expect(
      buildVehicleLabel({
        plate: "abc123",
        make: "mazda",
        model: "3",
        year: 2018,
      }),
    ).toBe("ABC123 · MAZDA 3 – 2018");
  });

  it("omits plate when missing", () => {
    expect(
      buildVehicleLabel({ make: "Kia", model: "Picanto", year: "2020" }),
    ).toBe("KIA PICANTO – 2020");
  });

  it("returns empty when incomplete", () => {
    expect(buildVehicleLabel({ make: "", model: "3", year: 2018 })).toBe("");
  });
});

describe("parseMileage / isValidVehicleMileage", () => {
  it("parses integers and treats empty as null/valid", () => {
    expect(parseMileage("45000")).toBe(45000);
    expect(parseMileage("45.000")).toBe(45000);
    expect(parseMileage("")).toBeNull();
    expect(isValidVehicleMileage("")).toBe(true);
    expect(isValidVehicleMileage("abc")).toBe(false);
  });
});
