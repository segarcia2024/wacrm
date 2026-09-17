import { describe, expect, it } from "vitest";
import {
  asOne,
  groupAssignmentsByContact,
  pickAssignedVehicle,
  vehicleLabelFromDeal,
  type ContactDealAssignment,
} from "@/lib/contacts/assigned-vehicle";

function deal(
  overrides: Partial<ContactDealAssignment> &
    Pick<ContactDealAssignment, "id" | "contact_id" | "created_at">,
): ContactDealAssignment {
  return {
    title: "",
    status: "open",
    ...overrides,
  };
}

describe("asOne", () => {
  it("unwraps arrays and passes objects through", () => {
    expect(asOne({ full_name: "Ana" })).toEqual({ full_name: "Ana" });
    expect(asOne([{ full_name: "Ana" }])).toEqual({ full_name: "Ana" });
    expect(asOne(null)).toBeNull();
    expect(asOne([])).toBeNull();
  });
});

describe("vehicleLabelFromDeal", () => {
  it("prefers inventory fields over the deal title", () => {
    expect(
      vehicleLabelFromDeal(
        deal({
          id: "d1",
          contact_id: "c1",
          created_at: "2026-01-01",
          title: "viejo",
          vehicle: { plate: "abc 123", make: "mazda", model: "3", year: 2018 },
        }),
      ),
    ).toBe("ABC123 · MAZDA 3 – 2018");
  });

  it("falls back to the deal title when no vehicle is linked", () => {
    expect(
      vehicleLabelFromDeal(
        deal({
          id: "d1",
          contact_id: "c1",
          created_at: "2026-01-01",
          title: "KIA PICANTO – 2020",
        }),
      ),
    ).toBe("KIA PICANTO – 2020");
  });
});

describe("pickAssignedVehicle", () => {
  it("prefers an open deal with a vehicle over a newer won deal", () => {
    const summary = pickAssignedVehicle([
      deal({
        id: "won",
        contact_id: "c1",
        created_at: "2026-06-01",
        status: "won",
        vehicle: { plate: "ZZZ999", make: "kia", model: "rio", year: 2015 },
      }),
      deal({
        id: "open",
        contact_id: "c1",
        created_at: "2026-01-01",
        status: "open",
        vehicle: { plate: "abc123", make: "mazda", model: "3", year: 2018 },
        assignee: { full_name: "Carlos" },
      }),
    ]);
    expect(summary?.label).toBe("ABC123 · MAZDA 3 – 2018");
    expect(summary?.agentName).toBe("Carlos");
    expect(summary?.dealStatus).toBe("open");
    expect(summary?.extraCount).toBe(1);
  });

  it("returns null when there are no deals", () => {
    expect(pickAssignedVehicle([])).toBeNull();
  });
});

describe("groupAssignmentsByContact", () => {
  it("maps each contact to its primary assignment", () => {
    const map = groupAssignmentsByContact([
      deal({
        id: "d1",
        contact_id: "c1",
        created_at: "2026-01-01",
        vehicle: { plate: "ABC123", make: "MAZDA", model: "3", year: 2018 },
      }),
      deal({
        id: "d2",
        contact_id: "c2",
        created_at: "2026-01-01",
        title: "KIA RIO – 2019",
      }),
    ]);
    expect(map.get("c1")?.plate).toBe("ABC123");
    expect(map.get("c2")?.label).toBe("KIA RIO – 2019");
  });
});
