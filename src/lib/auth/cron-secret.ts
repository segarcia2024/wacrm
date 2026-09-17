import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Authorize a cron/pinger request via `x-cron-secret`.
 *
 * Returns a ready-to-return 503/401 response when the secret is missing
 * or wrong; `null` when the caller is authorized. Comparison is
 * constant-time so response latency does not leak the secret byte-by-byte.
 */
export function unauthorizedCronResponse(
  request: Request,
): NextResponse | null {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }

  const supplied = request.headers.get("x-cron-secret") ?? "";
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);

  // Length pre-check is required by timingSafeEqual (throws otherwise)
  // and only leaks the secret length, which is not sensitive.
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
