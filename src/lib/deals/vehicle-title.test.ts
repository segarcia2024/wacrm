import { describe, expect, it } from "vitest";
import {
  buildVehicleDealTitle,
  isValidVehicleYear,
  parseVehicleDealTitle,
  VEHICLE_TITLE_SEPARATOR,
} from "@/lib/deals/vehicle-title";

describe("buildVehicleDealTitle", () => {
  it("builds MARCA MODELO – AÑO in uppercase with en-dash", () => {
    expect(
      buildVehicleDealTitle({
        make: "renault",
        model: "r 9 brio",
        year: 1995,
      }),
    ).toBe(`RENAULT R 9 BRIO${VEHICLE_TITLE_SEPARATOR}1995`);
  });

  it("trims whitespace on all parts", () => {
    expect(
      buildVehicleDealTitle({
        make: "  Mazda  ",
        model: " 3 ",
        year: " 2018 ",
      }),
    ).toBe(`MAZDA 3${VEHICLE_TITLE_SEPARATOR}2018`);
  });

  it("returns empty string when any part is missing", () => {
    expect(buildVehicleDealTitle({ make: "", model: "CX-5", year: 2020 })).toBe(
      "",
    );
    expect(buildVehicleDealTitle({ make: "Mazda", model: "", year: 2020 })).toBe(
      "",
    );
    expect(
      buildVehicleDealTitle({ make: "Mazda", model: "CX-5", year: "" }),
    ).toBe("");
  });
});

describe("parseVehicleDealTitle", () => {
  it("parses MARCA MODELO – AÑO", () => {
    expect(
      parseVehicleDealTitle(`RENAULT R 9 BRIO${VEHICLE_TITLE_SEPARATOR}1995`),
    ).toEqual({
      make: "RENAULT",
      model: "R 9 BRIO",
      year: "1995",
    });
  });

  it("parses hyphen and trailing-year forms", () => {
    expect(parseVehicleDealTitle("Mazda 3 - 2018")).toEqual({
      make: "Mazda",
      model: "3",
      year: "2018",
    });
    expect(parseVehicleDealTitle("KIA PICANTO 2020")).toEqual({
      make: "KIA",
      model: "PICANTO",
      year: "2020",
    });
  });

  it("returns null for unparseable titles", () => {
    expect(parseVehicleDealTitle("")).toBeNull();
    expect(parseVehicleDealTitle("solo texto")).toBeNull();
  });
});

describe("isValidVehicleYear", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("accepts years from 1950 through next calendar year", () => {
    expect(isValidVehicleYear(1950, now)).toBe(true);
    expect(isValidVehicleYear(1995, now)).toBe(true);
    expect(isValidVehicleYear(2026, now)).toBe(true);
    expect(isValidVehicleYear(2027, now)).toBe(true);
  });

  it("rejects out-of-range or non-integer years", () => {
    expect(isValidVehicleYear(1949, now)).toBe(false);
    expect(isValidVehicleYear(2028, now)).toBe(false);
    expect(isValidVehicleYear("abc", now)).toBe(false);
    expect(isValidVehicleYear("19.95", now)).toBe(false);
  });
});
