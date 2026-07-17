// ============================================================
// POST /api/billing/checkout
//
// Crea un checkout Wompi para licencias B2B (asesores REVIO).
// Requiere sesión admin+ del tenant. Persiste la transacción
// en `pending` y devuelve los datos para el widget de Wompi.
// ============================================================

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  calculateAmountInCents,
  isBillingCycleMonths,
  MAX_SEATS_PER_CHECKOUT,
} from "@/lib/billing/pricing";
import {
  assertWompiKeysConfigured,
  generateWompiIntegritySignature,
  getWompiIntegritySecret,
} from "@/lib/billing/wompi-integrity";
import { getServerWompiEnvironment } from "@/lib/billing/wompi-config";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

interface CheckoutBody {
  seats?: unknown;
  billingCycle?: unknown;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `billing:checkout:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as CheckoutBody | null;
    const rawSeats = body?.seats;

    if (typeof rawSeats !== "number" || !Number.isInteger(rawSeats)) {
      return NextResponse.json(
        { error: "'seats' must be a positive integer" },
        { status: 400 },
      );
    }

    if (rawSeats < 1 || rawSeats > MAX_SEATS_PER_CHECKOUT) {
      return NextResponse.json(
        {
          error: `'seats' must be between 1 and ${MAX_SEATS_PER_CHECKOUT}`,
        },
        { status: 400 },
      );
    }

    const rawBillingCycle = body?.billingCycle;
    if (
      typeof rawBillingCycle !== "number" ||
      !Number.isInteger(rawBillingCycle) ||
      !isBillingCycleMonths(rawBillingCycle)
    ) {
      return NextResponse.json(
        { error: "'billingCycle' must be one of: 1, 3, 6, 12" },
        { status: 400 },
      );
    }

    const seats = rawSeats;
    const billingCycle = rawBillingCycle;
    const amountInCents = calculateAmountInCents(seats, billingCycle);
    const reference = randomUUID();

    let integritySecret: string;
    try {
      assertWompiKeysConfigured();
      integritySecret = getWompiIntegritySecret();
    } catch (err) {
      console.error("[billing/checkout] Wompi keys misconfigured:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Payment gateway is not configured",
        },
        { status: 503 },
      );
    }

    const signature = generateWompiIntegritySignature(
      reference,
      amountInCents,
      integritySecret,
    );

    const { data: transaction, error: insertErr } = await ctx.supabase
      .from("transactions")
      .insert({
        account_id: ctx.accountId,
        reference,
        amount_in_cents: amountInCents,
        status: "pending",
        seats_purchased: seats,
        billing_cycle_months: billingCycle,
        includes_setup_fee: false,
        created_by: ctx.userId,
      })
      .select("reference, amount_in_cents")
      .single();

    if (insertErr || !transaction) {
      console.error("[billing/checkout] insert failed:", insertErr);
      return NextResponse.json(
        { error: "Could not create transaction" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      reference: transaction.reference,
      amount_in_cents: transaction.amount_in_cents,
      signature,
      environment: getServerWompiEnvironment(),
      currency: "COP",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
