/**
 * Currency — single source of truth for deal-value formatting in COP.
 *
 * The DMS operates exclusively in Colombian Pesos (COP). Values are
 * always whole numbers (no centavos). Formatting uses `es-CO` locale
 * via the native Intl API.
 */

/** ISO-4217 code used across the app and stored in the DB. */
export const DEFAULT_CURRENCY = "COP";

/** BCP-47 locale for currency display. */
export const CURRENCY_LOCALE = "es-CO";

export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

/** Single supported currency for the Colombian DMS. */
export const CURRENCIES: CurrencyOption[] = [
  { code: "COP", label: "Peso colombiano", symbol: "$" },
];

const copFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: DEFAULT_CURRENCY,
  maximumFractionDigits: 0,
});

const copIntegerFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  maximumFractionDigits: 0,
});

/** Compact-display symbol extracted once from Intl (typically "$"). */
const COP_SYMBOL =
  copFormatter.formatToParts(0).find((p) => p.type === "currency")?.value ??
  "$";

/**
 * Parse a deal value input into a non-negative integer (COP).
 * Strips grouping separators and rejects fractional amounts.
 */
export function parseDealValue(
  raw: string | number | null | undefined,
): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return 0;
    return Math.max(0, Math.round(raw));
  }
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Returns true when `value` is a valid whole-number COP amount.
 */
export function isValidDealValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Format a deal value as Colombian Pesos. Always uses COP regardless
 * of any legacy `currency` argument kept for call-site compatibility.
 */
export function formatCurrency(
  value: number,
  _currency: string = DEFAULT_CURRENCY,
): string {
  const amount = parseDealValue(value);
  try {
    return copFormatter.format(amount);
  } catch {
    return `${DEFAULT_CURRENCY} ${copIntegerFormatter.format(amount)}`;
  }
}

/**
 * Compact currency for tight spaces (donut center, legend rows):
 * "$2.5M" / "$3.4k" / "$900".
 */
export function formatCurrencyShort(
  value: number,
  _currency: string = DEFAULT_CURRENCY,
): string {
  return `${COP_SYMBOL}${formatCompactNumber(parseDealValue(value))}`;
}

/**
 * Compact number for chart tiles and legends.
 */
export function formatCompactNumber(value: number): string {
  const v = parseDealValue(value);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

/**
 * Sanitize a raw input string so only whole digits remain (for
 * controlled `<input>` onChange handlers).
 */
export function sanitizeDealValueInput(raw: string): string {
  if (raw === "") return "";
  return raw.replace(/\D/g, "");
}
