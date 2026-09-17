import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for Docker / nginx. No auth, no Supabase — must stay
 * cheap so a stuck Auth call cannot make the whole box look dead.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
