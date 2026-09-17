import { NextResponse } from "next/server";

/** Generic message returned to clients on unexpected server failures. */
export const INTERNAL_ERROR_MESSAGE = "Internal server error";

/**
 * Log a server-side failure and return a generic 500.
 * Never forward DB / provider / stack messages to the wire.
 */
export function internalErrorResponse(
  context: string,
  err: unknown,
): NextResponse {
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: INTERNAL_ERROR_MESSAGE },
    { status: 500 },
  );
}

/**
 * Log a Supabase/PostgREST error shape (`{ message }`) and return a
 * generic 500. Prefer this over `NextResponse.json({ error: error.message })`.
 */
export function dbErrorResponse(
  context: string,
  error: { message?: string } | null | undefined,
): NextResponse {
  console.error(`[${context}]`, error?.message ?? error);
  return NextResponse.json(
    { error: INTERNAL_ERROR_MESSAGE },
    { status: 500 },
  );
}
