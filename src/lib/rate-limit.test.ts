import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRateLimitForTests,
  checkRateLimit,
  rateLimitResponse,
} from "./rate-limit";

const OPTS = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("permits the first request and decrements remaining", async () => {
    const result = await checkRateLimit("user:1", OPTS);
    expect(result).toMatchObject({
      success: true,
      remaining: 2,
      limit: 3,
    });
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it("permits exactly `limit` requests then rejects the next", async () => {
    expect((await checkRateLimit("user:1", OPTS)).success).toBe(true);
    expect((await checkRateLimit("user:1", OPTS)).success).toBe(true);
    expect((await checkRateLimit("user:1", OPTS)).success).toBe(true);
    const over = await checkRateLimit("user:1", OPTS);
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("keeps separate counters per key", async () => {
    await checkRateLimit("user:1", OPTS);
    await checkRateLimit("user:1", OPTS);
    await checkRateLimit("user:1", OPTS);
    const other = await checkRateLimit("user:2", OPTS);
    expect(other.success).toBe(true);
    expect(other.remaining).toBe(2);
  });

  it("opens a fresh window after `windowMs` elapses", async () => {
    vi.useFakeTimers();
    try {
      const t0 = new Date("2026-05-01T00:00:00Z").getTime();
      vi.setSystemTime(t0);
      __resetRateLimitForTests();

      await checkRateLimit("user:1", OPTS);
      await checkRateLimit("user:1", OPTS);
      await checkRateLimit("user:1", OPTS);
      expect((await checkRateLimit("user:1", OPTS)).success).toBe(false);

      vi.setSystemTime(t0 + OPTS.windowMs + 1);
      const refreshed = await checkRateLimit("user:1", OPTS);
      expect(refreshed.success).toBe(true);
      expect(refreshed.remaining).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses Upstash when REST credentials are set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { result: 1 }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkRateLimit("user:9", OPTS);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("falls back to memory when Upstash errors", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );

    const result = await checkRateLimit("user:fallback", OPTS);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);

    vi.unstubAllGlobals();
  });
});

describe("rateLimitResponse", () => {
  it("returns a 429 with retry / X-RateLimit headers", async () => {
    const reset = Date.now() + 30_000;
    const res = rateLimitResponse({
      success: false,
      remaining: 0,
      reset,
      limit: 60,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rate limit/i);
  });

  it("clamps Retry-After to a minimum of 1 second", () => {
    const res = rateLimitResponse({
      success: false,
      remaining: 0,
      reset: Date.now() - 5_000,
      limit: 10,
    });
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });
});

describe("RATE_LIMITS presets", () => {
  it("send and broadcast budgets are independent", async () => {
    __resetRateLimitForTests();
    const { RATE_LIMITS } = await import("./rate-limit");
    expect(RATE_LIMITS.send.limit).toBeGreaterThan(RATE_LIMITS.broadcast.limit);
    expect(RATE_LIMITS.send.windowMs).toBe(60_000);
    expect(RATE_LIMITS.broadcast.windowMs).toBe(60_000);
  });
});

afterEach(() => {
  __resetRateLimitForTests();
  vi.unstubAllGlobals();
});
