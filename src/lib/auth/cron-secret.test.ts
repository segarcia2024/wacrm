import { afterEach, describe, expect, it } from "vitest";

import { unauthorizedCronResponse } from "./cron-secret";

describe("unauthorizedCronResponse", () => {
  const previous = process.env.AUTOMATION_CRON_SECRET;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.AUTOMATION_CRON_SECRET;
    } else {
      process.env.AUTOMATION_CRON_SECRET = previous;
    }
  });

  it("returns 503 when the cron secret is not configured", async () => {
    delete process.env.AUTOMATION_CRON_SECRET;
    const res = unauthorizedCronResponse(
      new Request("https://app.test/api/automations/cron"),
    );
    expect(res?.status).toBe(503);
  });

  it("returns 401 when the header is wrong", async () => {
    process.env.AUTOMATION_CRON_SECRET = "correct-secret-value";
    const res = unauthorizedCronResponse(
      new Request("https://app.test/api/automations/cron", {
        headers: { "x-cron-secret": "wrong-secret-value" },
      }),
    );
    expect(res?.status).toBe(401);
  });

  it("returns null when the header matches", () => {
    process.env.AUTOMATION_CRON_SECRET = "correct-secret-value";
    const res = unauthorizedCronResponse(
      new Request("https://app.test/api/automations/cron", {
        headers: { "x-cron-secret": "correct-secret-value" },
      }),
    );
    expect(res).toBeNull();
  });
});
