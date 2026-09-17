import { describe, expect, it } from "vitest";

import {
  exceedsLicensedSeats,
  roleConsumesSeat,
} from "./seats";

describe("roleConsumesSeat", () => {
  it("counts owner, admin and agent", () => {
    expect(roleConsumesSeat("owner")).toBe(true);
    expect(roleConsumesSeat("admin")).toBe(true);
    expect(roleConsumesSeat("agent")).toBe(true);
  });

  it("does not count viewers", () => {
    expect(roleConsumesSeat("viewer")).toBe(false);
  });
});

describe("exceedsLicensedSeats", () => {
  const full = { licensedSeats: 2, usedSeats: 2, pendingAgentInvites: 0 };

  it("does not enforce when there is no paid plan", () => {
    expect(
      exceedsLicensedSeats(
        { licensedSeats: 0, usedSeats: 8, pendingAgentInvites: 0 },
        "agent",
      ),
    ).toBe(false);
  });

  it("never blocks a viewer", () => {
    expect(exceedsLicensedSeats(full, "viewer")).toBe(false);
  });

  it("blocks an agent when seats are full", () => {
    expect(exceedsLicensedSeats(full, "agent")).toBe(true);
  });

  it("counts pending invites as reserved seats", () => {
    expect(
      exceedsLicensedSeats(
        { licensedSeats: 2, usedSeats: 1, pendingAgentInvites: 1 },
        "agent",
      ),
    ).toBe(true);
  });

  it("allows redeem to ignore pending invites (the current invite is the one being redeemed)", () => {
    expect(
      exceedsLicensedSeats(
        { licensedSeats: 2, usedSeats: 1, pendingAgentInvites: 1 },
        "agent",
        { countPendingInvites: false },
      ),
    ).toBe(false);
  });
});
