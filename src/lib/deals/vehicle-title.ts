/**
 * Build a deal title from vehicle fields for the automotive CRM.
 * Format: `MARCA MODELO – AÑO` (en-dash), matching how agents identify
 * which car a deal refers to in Conversations and Pipeline.
 */

export interface VehicleDealTitleParts {
  make: string;
  model: string;
  year: string | number;
}

/** En-dash separator used in vehicle deal titles. */
export const VEHICLE_TITLE_SEPARATOR = " – ";

/**
 * Normalize and compose a vehicle deal title.
 * Returns empty string if make, model, or year is missing after trim.
 */
export function buildVehicleDealTitle(parts: VehicleDealTitleParts): string {
  const make = String(parts.make ?? "").trim().toUpperCase();
  const model = String(parts.model ?? "").trim().toUpperCase();
  const year = String(parts.year ?? "").trim();

  if (!make || !model || !year) return "";

  return `${make} ${model}${VEHICLE_TITLE_SEPARATOR}${year}`;
}

/**
 * Year must be a 4-digit integer in a sensible automotive range.
 */
export function isValidVehicleYear(
  year: string | number,
  now = new Date(),
): boolean {
  const n =
    typeof year === "number"
      ? year
      : Number.parseInt(String(year).trim(), 10);
  if (!Number.isInteger(n)) return false;
  const max = now.getFullYear() + 1;
  return n >= 1950 && n <= max;
}

/**
 * Best-effort parse of `MARCA MODELO – AÑO` (also accepts em/hyphen dashes
 * or a trailing 4-digit year). Returns null when the title cannot be split.
 */
export function parseVehicleDealTitle(
  title: string,
): VehicleDealTitleParts | null {
  const raw = String(title ?? "").trim();
  if (!raw) return null;

  let head = "";
  let year = "";

  const dashParts = raw.split(/\s+[–—-]\s+/);
  if (dashParts.length >= 2) {
    year = dashParts[dashParts.length - 1].trim();
    head = dashParts.slice(0, -1).join(" – ").trim();
  } else {
    const m = raw.match(/^(.*?)\s+(\d{4})$/);
    if (!m) return null;
    head = m[1].trim();
    year = m[2];
  }

  if (!head || !/^\d{4}$/.test(year)) return null;

  const words = head.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) {
    return { make: words[0], model: words[0], year };
  }
  return {
    make: words[0],
    model: words.slice(1).join(" "),
    year,
  };
}
