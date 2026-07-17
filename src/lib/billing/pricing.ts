/** Precio mensual por asesor en pesos colombianos (enteros, sin centavos). */
export const ADVISOR_MONTHLY_PRICE_COP = 99_000;

/** Costo único de implementación (configuración inicial y capacitación). */
export const SETUP_FEE_COP = 500_000;

export const BILLING_CURRENCY = "COP" as const;

/** Límite razonable de asientos por checkout B2B. */
export const MAX_SEATS_PER_CHECKOUT = 500;

/** Ciclos de facturación soportados (meses). */
export const BILLING_CYCLES = [1, 3, 6, 12] as const;

export type BillingCycleMonths = (typeof BILLING_CYCLES)[number];

/**
 * Multiplicador de precio tras descuento por ciclo.
 * 1 mes = 0% off, 3 = 10% off, 6 = 15% off, 12 = 20% off.
 */
export const BILLING_CYCLE_DISCOUNT_MULTIPLIER: Record<
  BillingCycleMonths,
  number
> = {
  1: 1,
  3: 0.9,
  6: 0.85,
  12: 0.8,
};

export const BILLING_CYCLE_LABELS: Record<BillingCycleMonths, string> = {
  1: "Mensual",
  3: "Trimestral",
  6: "Semestral",
  12: "Anual",
};

function assertValidSeats(seats: number): void {
  if (!Number.isInteger(seats) || seats < 1) {
    throw new Error("INVALID_SEATS");
  }
}

export function isBillingCycleMonths(
  value: number,
): value is BillingCycleMonths {
  return (BILLING_CYCLES as readonly number[]).includes(value);
}

function assertValidBillingCycle(billingCycle: number): asserts billingCycle is BillingCycleMonths {
  if (!isBillingCycleMonths(billingCycle)) {
    throw new Error("INVALID_BILLING_CYCLE");
  }
}

export function getBillingCycleDiscountMultiplier(
  billingCycle: BillingCycleMonths,
): number {
  return BILLING_CYCLE_DISCOUNT_MULTIPLIER[billingCycle];
}

/** Porcentaje de descuento entero (0–20) para UI. */
export function getBillingCycleDiscountPercent(
  billingCycle: BillingCycleMonths,
): number {
  return Math.round((1 - BILLING_CYCLE_DISCOUNT_MULTIPLIER[billingCycle]) * 100);
}

/** Precio mensual por asesor tras aplicar el descuento del ciclo. */
export function calculateDiscountedMonthlyPriceCOP(
  billingCycle: BillingCycleMonths,
): number {
  return Math.round(
    ADVISOR_MONTHLY_PRICE_COP *
      BILLING_CYCLE_DISCOUNT_MULTIPLIER[billingCycle],
  );
}

/**
 * Total COP de la suscripción antes de convertir a centavos Wompi.
 * Total = seats × precio_base × billingCycle × descuento
 */
export function calculateSubscriptionTotalCOP(
  seats: number,
  billingCycle: BillingCycleMonths,
): number {
  assertValidSeats(seats);
  assertValidBillingCycle(billingCycle);
  return Math.round(
    seats *
      ADVISOR_MONTHLY_PRICE_COP *
      billingCycle *
      BILLING_CYCLE_DISCOUNT_MULTIPLIER[billingCycle],
  );
}

/**
 * Convierte el total COP a centavos exigidos por Wompi.
 * Ej.: 2 asesores × 3 meses × 10% off → 534_600 COP → 53_460_000 centavos.
 */
export function calculateAmountInCents(
  seats: number,
  billingCycle: BillingCycleMonths,
  includeSetupFee = false,
): number {
  const subscriptionTotal = calculateSubscriptionTotalCOP(seats, billingCycle);
  return (
    (subscriptionTotal + (includeSetupFee ? SETUP_FEE_COP : 0)) * 100
  );
}
