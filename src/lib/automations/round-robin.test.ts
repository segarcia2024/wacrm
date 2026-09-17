import { describe, expect, it } from "vitest";
import {
  pickNextRoundRobinAgent,
  ROUND_ROBIN_ELIGIBLE_ROLES,
} from "./round-robin";

describe("pickNextRoundRobinAgent", () => {
  const agents = ["aaa", "bbb", "ccc"] as const;

  it("returns null for an empty pool", () => {
    expect(pickNextRoundRobinAgent([], null)).toBeNull();
    expect(pickNextRoundRobinAgent([], "aaa")).toBeNull();
  });

  it("picks the first agent when there is no cursor", () => {
    expect(pickNextRoundRobinAgent(agents, null)).toBe("aaa");
    expect(pickNextRoundRobinAgent(agents, undefined)).toBe("aaa");
  });

  it("advances to the next agent after the cursor", () => {
    expect(pickNextRoundRobinAgent(agents, "aaa")).toBe("bbb");
    expect(pickNextRoundRobinAgent(agents, "bbb")).toBe("ccc");
  });

  it("wraps around after the last agent", () => {
    expect(pickNextRoundRobinAgent(agents, "ccc")).toBe("aaa");
  });

  it("restarts at the head when the cursor left the pool", () => {
    expect(pickNextRoundRobinAgent(agents, "gone")).toBe("aaa");
  });

  it("works with a single-agent pool", () => {
    expect(pickNextRoundRobinAgent(["solo"], null)).toBe("solo");
    expect(pickNextRoundRobinAgent(["solo"], "solo")).toBe("solo");
  });

  it("rotates evenly across a full cycle", () => {
    let cursor: string | null = null;
    const sequence: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = pickNextRoundRobinAgent(agents, cursor);
      expect(next).not.toBeNull();
      sequence.push(next!);
      cursor = next;
    }
    expect(sequence).toEqual(["aaa", "bbb", "ccc", "aaa", "bbb", "ccc"]);
  });
});

describe("ROUND_ROBIN_ELIGIBLE_ROLES", () => {
  it("includes only agent (excludes owner, admin, viewer)", () => {
    expect(ROUND_ROBIN_ELIGIBLE_ROLES).toEqual(["agent"]);
    expect(ROUND_ROBIN_ELIGIBLE_ROLES).not.toContain("owner");
    expect(ROUND_ROBIN_ELIGIBLE_ROLES).not.toContain("admin");
    expect(ROUND_ROBIN_ELIGIBLE_ROLES).not.toContain("viewer");
  });
});
