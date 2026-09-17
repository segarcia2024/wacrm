import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  extractWompiTransaction,
  mapWompiTransactionStatus,
  verifyWompiEventChecksum,
  type WompiEventPayload,
} from "./wompi-events";

const SECRET = "test_events_secret";

function signedPayload(
  overrides: Partial<WompiEventPayload> = {},
): WompiEventPayload {
  const data = {
    transaction: {
      id: "tx-1",
      status: "APPROVED",
      amount_in_cents: 9900000,
      reference: "11111111-1111-1111-1111-111111111111",
    },
  };
  const timestamp = 1710000000;
  const properties = [
    "transaction.id",
    "transaction.status",
    "transaction.amount_in_cents",
  ];
  const checksum = createHash("sha256")
    .update(`tx-1APPROVED9900000${timestamp}${SECRET}`, "utf8")
    .digest("hex");
  return {
    event: "transaction.updated",
    data,
    timestamp,
    signature: { checksum, properties },
    ...overrides,
  };
}

describe("verifyWompiEventChecksum", () => {
  it("accepts a valid checksum", () => {
    expect(verifyWompiEventChecksum(signedPayload(), SECRET)).toBe(true);
  });

  it("rejects a tampered checksum", () => {
    const payload = signedPayload();
    payload.signature = { ...payload.signature, checksum: "deadbeef" };
    expect(verifyWompiEventChecksum(payload, SECRET)).toBe(false);
  });

  it("rejects missing signature", () => {
    expect(verifyWompiEventChecksum({ data: {} }, SECRET)).toBe(false);
  });
});

describe("mapWompiTransactionStatus", () => {
  it("maps Wompi statuses", () => {
    expect(mapWompiTransactionStatus("APPROVED")).toBe("approved");
    expect(mapWompiTransactionStatus("DECLINED")).toBe("declined");
    expect(mapWompiTransactionStatus("VOIDED")).toBe("declined");
    expect(mapWompiTransactionStatus("PENDING")).toBe("pending");
    expect(mapWompiTransactionStatus("UNKNOWN")).toBeNull();
  });
});

describe("extractWompiTransaction", () => {
  it("reads reference and mapped status", () => {
    const extracted = extractWompiTransaction(signedPayload());
    expect(extracted).toEqual({
      reference: "11111111-1111-1111-1111-111111111111",
      status: "approved",
      amountInCents: 9900000,
    });
  });
});
