import { describe, expect, it } from "vitest";
import { isDealInAgentScope } from "./visibility";

describe("isDealInAgentScope", () => {
  const profileId = "profile-agent-1";

  it("allows unassigned deals", () => {
    expect(isDealInAgentScope({ assigned_to: null }, profileId)).toBe(true);
    expect(isDealInAgentScope({ assigned_to: undefined }, profileId)).toBe(true);
  });

  it("allows deals assigned to self", () => {
    expect(isDealInAgentScope({ assigned_to: profileId }, profileId)).toBe(true);
  });

  it("rejects deals assigned to someone else", () => {
    expect(
      isDealInAgentScope({ assigned_to: "profile-other" }, profileId),
    ).toBe(false);
  });
});
