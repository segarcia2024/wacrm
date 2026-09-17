import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";

export type ParseBodySuccess<T> = { ok: true; data: T };
export type ParseBodyFailure = { ok: false; response: NextResponse };
export type ParseBodyResult<T> = ParseBodySuccess<T> | ParseBodyFailure;

/**
 * Read JSON from a Request and validate with Zod.
 * Returns a ready-to-return 400 NextResponse on invalid JSON or schema miss.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<ParseBodyResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first
      ? `${first.path.length ? first.path.join(".") + ": " : ""}${first.message}`
      : "Invalid request body";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }

  return { ok: true, data: parsed.data };
}
