import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getServerWompiEnvironment,
  inferEnvironmentFromPublicKey,
  validateWompiKeyPair,
} from "./wompi-config";

describe("wompi-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("infers sandbox from pub_test_ keys", () => {
    expect(
      inferEnvironmentFromPublicKey("pub_test_X0zDA9xoKdePzhd8a0x9HAez7HgGO2fH"),
    ).toBe("sandbox");
  });

  it("validates matching sandbox key pair", () => {
    expect(
      validateWompiKeyPair({
        environment: "sandbox",
        publicKey: "pub_test_abc",
        integritySecret: "test_integrity_xyz",
      }),
    ).toBeNull();
  });

  it("rejects production keys when WOMPI_ENV=sandbox", () => {
    expect(
      validateWompiKeyPair({
        environment: "sandbox",
        publicKey: "pub_prod_abc",
        integritySecret: "prod_integrity_xyz",
      }),
    ).toContain("WOMPI_ENV=sandbox");
  });

  it("defaults server environment to sandbox outside production", () => {
    vi.stubEnv("WOMPI_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getServerWompiEnvironment()).toBe("sandbox");
  });
});
