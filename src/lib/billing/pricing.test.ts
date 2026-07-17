import { describe, expect, it } from "vitest";

import {
  ADVISOR_MONTHLY_PRICE_COP,
  calculateAmountInCents,
  calculateDiscountedMonthlyPriceCOP,
  calculateSubscriptionTotalCOP,
  SETUP_FEE_COP,
} from "./pricing";

describe("calculateDiscountedMonthlyPriceCOP", () => {
  it("applies cycle discounts to the monthly unit price", () => {
    expect(calculateDiscountedMonthlyPriceCOP(1)).toBe(ADVISOR_MONTHLY_PRICE_COP);
    expect(calculateDiscountedMonthlyPriceCOP(3)).toBe(89_100);
    expect(calculateDiscountedMonthlyPriceCOP(6)).toBe(84_150);
    expect(calculateDiscountedMonthlyPriceCOP(12)).toBe(79_200);
  });
});

describe("calculateSubscriptionTotalCOP", () => {
  it("computes seats × base × cycle × discount multiplier", () => {
    expect(calculateSubscriptionTotalCOP(1, 1)).toBe(ADVISOR_MONTHLY_PRICE_COP);
    expect(calculateSubscriptionTotalCOP(2, 3)).toBe(534_600);
    expect(calculateSubscriptionTotalCOP(5, 12)).toBe(4_752_000);
  });

  it("rejects invalid seat counts", () => {
    expect(() => calculateSubscriptionTotalCOP(0, 1)).toThrow("INVALID_SEATS");
  });

  it("rejects invalid billing cycles", () => {
    expect(() => calculateSubscriptionTotalCOP(1, 2)).toThrow(
      "INVALID_BILLING_CYCLE",
    );
  });
});

describe("calculateAmountInCents", () => {
  it("multiplies COP total × 100 for Wompi", () => {
    expect(calculateAmountInCents(1, 1)).toBe(
      ADVISOR_MONTHLY_PRICE_COP * 100,
    );
    expect(calculateAmountInCents(2, 3)).toBe(53_460_000);
  });

  it("optionally adds setup fee before converting to cents", () => {
    expect(calculateAmountInCents(1, 1, true)).toBe(
      (ADVISOR_MONTHLY_PRICE_COP + SETUP_FEE_COP) * 100,
    );
  });

  it("rejects invalid seat counts", () => {
    expect(() => calculateAmountInCents(0, 1)).toThrow("INVALID_SEATS");
    expect(() => calculateAmountInCents(-1, 1)).toThrow("INVALID_SEATS");
    expect(() => calculateAmountInCents(1.5, 1)).toThrow("INVALID_SEATS");
  });
});
