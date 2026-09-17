import { describe, expect, it } from "vitest";

import { hashVerifyToken } from "./verify-token-hash";

describe("hashVerifyToken", () => {
  it("is stable for the same plaintext", () => {
    expect(hashVerifyToken("hub-token")).toBe(hashVerifyToken("hub-token"));
  });

  it("changes when the token changes", () => {
    expect(hashVerifyToken("a")).not.toBe(hashVerifyToken("b"));
  });
});
