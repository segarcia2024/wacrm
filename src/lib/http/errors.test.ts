import { describe, expect, it, vi } from "vitest";

import {
  INTERNAL_ERROR_MESSAGE,
  dbErrorResponse,
  internalErrorResponse,
} from "./errors";

describe("internalErrorResponse", () => {
  it("returns a generic 500 and logs the real error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalErrorResponse("test-ctx", new Error("secret db hint"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("secret db hint");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("dbErrorResponse", () => {
  it("never forwards PostgREST messages to the client", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = dbErrorResponse("db-ctx", {
      message: 'relation "secrets" does not exist',
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(INTERNAL_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("secrets");
    spy.mockRestore();
  });
});
