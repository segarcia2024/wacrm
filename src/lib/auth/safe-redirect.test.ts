import { describe, expect, it } from "vitest";

import { isSafeRedirectPath } from "./safe-redirect";

describe("isSafeRedirectPath", () => {
  it("allows internal paths", () => {
    expect(isSafeRedirectPath("/billing/subscribe")).toBe(true);
    expect(isSafeRedirectPath("/dashboard")).toBe(true);
  });

  it("blocks open redirects", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false);
    expect(isSafeRedirectPath("https://evil.com")).toBe(false);
    expect(isSafeRedirectPath("/\\evil")).toBe(false);
  });
});
