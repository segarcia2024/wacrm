import { createHash } from "node:crypto";

import { BILLING_CURRENCY } from "@/lib/billing/pricing";
import {
  getServerWompiEnvironment,
  getWompiPublicKey,
  validateWompiKeyPair,
} from "@/lib/billing/wompi-config";

/**
 * Firma de integridad Wompi (Web Checkout).
 *
 * Concatena en este orden exacto:
 *   referencia + monto_en_centavos + moneda + WOMPI_INTEGRITY_SECRET
 *
 * @see https://docs.wompi.co/docs/colombia/widget-checkout-web/
 */
export function generateWompiIntegritySignature(
  reference: string,
  amountInCents: number,
  integritySecret: string,
  currency: string = BILLING_CURRENCY,
): string {
  const payload = `${reference}${amountInCents}${currency}${integritySecret}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function getWompiIntegritySecret(): string {
  const secret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (!secret) {
    throw new Error("WOMPI_INTEGRITY_SECRET is not configured");
  }
  return secret;
}

/** Valida llaves Wompi antes de firmar un checkout. */
export function assertWompiKeysConfigured(): void {
  const environment = getServerWompiEnvironment();
  const publicKey = getWompiPublicKey();
  const integritySecret = getWompiIntegritySecret();
  const mismatch = validateWompiKeyPair({
    environment,
    publicKey,
    integritySecret,
  });
  if (mismatch) {
    throw new Error(mismatch);
  }
}
