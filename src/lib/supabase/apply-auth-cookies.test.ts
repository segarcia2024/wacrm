import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { applyAuthCookies } from "./apply-auth-cookies";

describe("applyAuthCookies", () => {
  it("writes cookies with Path=/ so they are sent outside /api/auth", () => {
    const response = NextResponse.json({ ok: true });

    applyAuthCookies(response, [
      {
        name: "sb-test-auth-token",
        value: "session-value",
        options: { path: "/", sameSite: "lax", httpOnly: false, maxAge: 100 },
      },
    ]);

    const cookie = response.cookies.get("sb-test-auth-token");
    expect(cookie?.value).toBe("session-value");
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
  });

  it("defaults Path=/ when options omit it", () => {
    const response = NextResponse.json({ ok: true });

    applyAuthCookies(response, [{ name: "sb-test-auth-token", value: "x" }]);

    expect(response.cookies.get("sb-test-auth-token")?.path).toBe("/");
  });
});
