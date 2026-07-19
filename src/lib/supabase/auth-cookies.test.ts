import { describe, expect, it } from "vitest";

import {
  clearSupabaseAuthCookies,
  hasSupabaseAuthCookies,
  isStaleRefreshTokenError,
  isSupabaseAuthCookie,
} from "./auth-cookies";

describe("auth-cookies", () => {
  it("detects Supabase auth cookie names", () => {
    expect(isSupabaseAuthCookie("sb-abc-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abc-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("other")).toBe(false);
  });

  it("detects stale refresh token errors", () => {
    expect(isStaleRefreshTokenError({ code: "refresh_token_not_found" })).toBe(
      true,
    );
    expect(isStaleRefreshTokenError({ code: "invalid_refresh_token" })).toBe(
      true,
    );
    expect(isStaleRefreshTokenError({ message: "Refresh Token Not Found" })).toBe(
      true,
    );
    expect(isStaleRefreshTokenError({ code: "other" })).toBe(false);
  });

  it("clears auth cookies from the response", () => {
    const request = {
      cookies: {
        getAll: () => [
          { name: "sb-test-auth-token", value: "x" },
          { name: "sb-test-auth-token.0", value: "y" },
          { name: "theme", value: "dark" },
        ],
      },
    } as unknown as import("next/server").NextRequest;

    const deleted: string[] = [];
    const response = {
      cookies: {
        delete: (name: string) => {
          deleted.push(name);
        },
      },
    } as unknown as import("next/server").NextResponse;

    expect(hasSupabaseAuthCookies(request.cookies.getAll())).toBe(true);
    clearSupabaseAuthCookies(request, response);
    expect(deleted).toEqual(["sb-test-auth-token", "sb-test-auth-token.0"]);
  });
});
