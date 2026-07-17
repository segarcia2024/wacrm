import { afterEach, describe, expect, it } from "vitest";

import { generateWompiIntegritySignature } from "./wompi-integrity";

describe("generateWompiIntegritySignature", () => {
  afterEach(() => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
  });

  it("hashes reference + amount + currency + secret in order", () => {
    const signature = generateWompiIntegritySignature(
      "550e8400-e29b-41d4-a716-446655440000",
      9_900_000,
      "test_integrity_secret",
      "COP",
    );

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(signature).toBe(
      generateWompiIntegritySignature(
        "550e8400-e29b-41d4-a716-446655440000",
        9_900_000,
        "test_integrity_secret",
        "COP",
      ),
    );
  });

  it("changes when any input changes", () => {
    const base = generateWompiIntegritySignature(
      "ref-a",
      100,
      "secret",
      "COP",
    );
    expect(generateWompiIntegritySignature("ref-b", 100, "secret", "COP")).not.toBe(
      base,
    );
    expect(generateWompiIntegritySignature("ref-a", 200, "secret", "COP")).not.toBe(
      base,
    );
    expect(generateWompiIntegritySignature("ref-a", 100, "other", "COP")).not.toBe(
      base,
    );
    expect(generateWompiIntegritySignature("ref-a", 100, "secret", "USD")).not.toBe(
      base,
    );
  });
});
