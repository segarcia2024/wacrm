import { afterEach, describe, expect, it, vi } from "vitest";
import { timedFetch } from "./timed-fetch";

describe("timedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips the timeout in development", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "development");

    await timedFetch("https://example.test/auth", { method: "GET" });

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.signal).toBeUndefined();
  });

  it("adds AbortSignal.timeout when the caller did not pass a signal", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await timedFetch("https://example.test/auth", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps a caller-provided signal", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await timedFetch("https://example.test/auth", { signal: controller.signal });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});
