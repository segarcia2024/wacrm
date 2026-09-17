import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonBody } from "./parse-body";

describe("parseJsonBody", () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int().positive().optional(),
  });

  it("returns data when body matches schema", async () => {
    const req = new Request("https://app.test/api", {
      method: "POST",
      body: JSON.stringify({ name: "ok", count: 2 }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(req, schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: "ok", count: 2 });
    }
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("https://app.test/api", {
      method: "POST",
      body: "{not-json",
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBe("Invalid JSON");
    }
  });

  it("returns 400 with field path on schema miss", async () => {
    const req = new Request("https://app.test/api", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(req, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(String(body.error)).toMatch(/name/i);
    }
  });
});
