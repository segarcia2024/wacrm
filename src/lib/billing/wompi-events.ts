import { createHash, timingSafeEqual } from "node:crypto";

export type TransactionStatus = "pending" | "approved" | "declined";

export interface WompiEventPayload {
  event?: unknown;
  data?: unknown;
  sent_at?: unknown;
  timestamp?: unknown;
  signature?: {
    checksum?: unknown;
    properties?: unknown;
  };
}

function getPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function getWompiEventsSecret(): string {
  const secret = process.env.WOMPI_EVENTS_SECRET?.trim();
  if (!secret) {
    throw new Error("WOMPI_EVENTS_SECRET is not configured");
  }
  return secret;
}

/**
 * Verifies Wompi Eventos checksum:
 * SHA256(concat(property values) + timestamp + events secret)
 * @see https://docs.wompi.co/docs/colombia/eventos/
 */
export function verifyWompiEventChecksum(
  payload: WompiEventPayload,
  eventsSecret: string,
): boolean {
  const checksum = payload.signature?.checksum;
  const properties = payload.signature?.properties;
  const timestamp = payload.timestamp;
  if (typeof checksum !== "string" || checksum.length === 0) return false;
  if (!Array.isArray(properties) || properties.length === 0) return false;
  if (timestamp === undefined || timestamp === null) return false;

  const values = properties.map((prop) => {
    if (typeof prop !== "string") return "";
    const value = getPath(payload.data, prop);
    return value === undefined || value === null ? "" : String(value);
  });
  const concatenated = `${values.join("")}${timestamp}${eventsSecret}`;
  const digest = createHash("sha256").update(concatenated, "utf8").digest("hex");

  try {
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(checksum, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function mapWompiTransactionStatus(
  raw: unknown,
): TransactionStatus | null {
  if (typeof raw !== "string") return null;
  switch (raw.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "DECLINED":
    case "ERROR":
    case "VOIDED":
      return "declined";
    case "PENDING":
      return "pending";
    default:
      return null;
  }
}

export function extractWompiTransaction(payload: WompiEventPayload): {
  reference: string;
  status: TransactionStatus;
  amountInCents: number | null;
} | null {
  const tx = getPath(payload.data, "transaction");
  if (!tx || typeof tx !== "object") return null;
  const record = tx as Record<string, unknown>;
  const reference =
    typeof record.reference === "string" ? record.reference.trim() : "";
  if (!reference) return null;
  const status = mapWompiTransactionStatus(record.status);
  if (!status) return null;
  const amount =
    typeof record.amount_in_cents === "number" ? record.amount_in_cents : null;
  return { reference, status, amountInCents: amount };
}
