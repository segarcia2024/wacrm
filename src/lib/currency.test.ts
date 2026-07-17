import { describe, expect, it } from "vitest";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatCurrency,
  formatCurrencyShort,
  isValidDealValue,
  parseDealValue,
  sanitizeDealValueInput,
} from "./currency";

describe("parseDealValue", () => {
  it("parses integers and rounds floats", () => {
    expect(parseDealValue("148900000")).toBe(148_900_000);
    expect(parseDealValue(132500.7)).toBe(132_501);
    expect(parseDealValue("148.900.000")).toBe(148_900_000);
  });

  it("returns 0 for empty or invalid input", () => {
    expect(parseDealValue("")).toBe(0);
    expect(parseDealValue(null)).toBe(0);
    expect(parseDealValue(Number.NaN)).toBe(0);
  });

  it("never returns negative values", () => {
    expect(parseDealValue(-500)).toBe(0);
  });
});

describe("isValidDealValue", () => {
  it("accepts non-negative integers only", () => {
    expect(isValidDealValue(0)).toBe(true);
    expect(isValidDealValue(148_900_000)).toBe(true);
    expect(isValidDealValue(10.5)).toBe(false);
    expect(isValidDealValue(-1)).toBe(false);
    expect(isValidDealValue("100")).toBe(false);
  });
});

describe("sanitizeDealValueInput", () => {
  it("strips non-digit characters", () => {
    expect(sanitizeDealValueInput("148.900.000")).toBe("148900000");
    expect(sanitizeDealValueInput("abc")).toBe("");
    expect(sanitizeDealValueInput("")).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats COP with es-CO locale and no decimals", () => {
    const out = formatCurrency(1_234);
    expect(out).toContain("1.234");
    expect(out).not.toContain(",00");
    expect(out).not.toContain(".00");
  });

  it("defaults to COP", () => {
    expect(formatCurrency(10)).toBe(formatCurrency(10, DEFAULT_CURRENCY));
  });

  it("ignores legacy currency codes and always formats as COP", () => {
    expect(formatCurrency(10, "USD")).toBe(formatCurrency(10, "COP"));
  });

  it("coerces non-finite values to 0", () => {
    expect(formatCurrency(Number.NaN)).toContain("0");
  });

  it("formats the only supported currency without throwing", () => {
    for (const c of CURRENCIES) {
      expect(() => formatCurrency(1_000_000, c.code)).not.toThrow();
    }
  });
});

describe("formatCurrencyShort", () => {
  it("abbreviates millions and thousands with the COP symbol", () => {
    expect(formatCurrencyShort(2_500_000)).toBe("$2.5M");
    expect(formatCurrencyShort(3_400)).toBe("$3.4k");
    expect(formatCurrencyShort(900)).toBe("$900");
  });

  it("always uses COP regardless of legacy currency arg", () => {
    expect(formatCurrencyShort(1_000, "USD")).toBe("$1.0k");
  });
});
