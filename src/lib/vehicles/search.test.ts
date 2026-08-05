import { describe, expect, it } from "vitest";
import { matchesVehicleSearch, vehicleSearchBlob } from "@/lib/vehicles/search";

describe("vehicleSearchBlob", () => {
  it("joins plate make model title lowercased", () => {
    expect(
      vehicleSearchBlob({
        plate: "ABC123",
        make: "Mazda",
        model: "3",
        title: "MAZDA 3 – 2018",
      }),
    ).toBe("abc123 mazda 3 mazda 3 – 2018");
  });
});

describe("matchesVehicleSearch", () => {
  const v = { plate: "ABC123", make: "MAZDA", model: "CX-5" };

  it("matches plate make and model fragments", () => {
    expect(matchesVehicleSearch(v, "abc")).toBe(true);
    expect(matchesVehicleSearch(v, "mazda")).toBe(true);
    expect(matchesVehicleSearch(v, "cx")).toBe(true);
    expect(matchesVehicleSearch(v, "toyota")).toBe(false);
  });

  it("matches any entry in a list", () => {
    expect(
      matchesVehicleSearch([v, { plate: "XYZ99", make: "KIA", model: "RIO" }], "rio"),
    ).toBe(true);
  });
});
