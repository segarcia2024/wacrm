export type WompiEnvironment = "sandbox" | "production";

/** Tarjetas de prueba oficiales — solo válidas con llaves `pub_test_`. */
export const WOMPI_SANDBOX_TEST_CARDS = [
  {
    label: "Aprobada",
    number: "4242 4242 4242 4242",
    status: "APPROVED",
    hint: "CVC: cualquier 3 dígitos · Vencimiento: cualquier fecha futura",
  },
  {
    label: "Declinada",
    number: "4111 1111 1111 1111",
    status: "DECLINED",
    hint: "CVC: cualquier 3 dígitos · Vencimiento: cualquier fecha futura",
  },
] as const;

export function parseWompiEnvironment(
  value: string | undefined,
): WompiEnvironment {
  return value === "production" ? "production" : "sandbox";
}

/** Ambiente activo en el servidor (default: sandbox en desarrollo). */
export function getServerWompiEnvironment(): WompiEnvironment {
  if (process.env.WOMPI_ENV) {
    return parseWompiEnvironment(process.env.WOMPI_ENV);
  }
  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
}

/** Ambiente expuesto al cliente para banners de prueba. */
export function getClientWompiEnvironment(): WompiEnvironment {
  if (process.env.NEXT_PUBLIC_WOMPI_ENV) {
    return parseWompiEnvironment(process.env.NEXT_PUBLIC_WOMPI_ENV);
  }
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY ?? "";
  if (publicKey.startsWith("pub_prod_")) return "production";
  if (publicKey.startsWith("pub_test_")) return "sandbox";
  return "sandbox";
}

export function inferEnvironmentFromPublicKey(
  publicKey: string,
): WompiEnvironment | null {
  if (publicKey.startsWith("pub_test_")) return "sandbox";
  if (publicKey.startsWith("pub_prod_")) return "production";
  return null;
}

export function inferEnvironmentFromIntegritySecret(
  secret: string,
): WompiEnvironment | null {
  if (secret.startsWith("test_integrity_")) return "sandbox";
  if (secret.startsWith("prod_integrity_")) return "production";
  return null;
}

/**
 * Verifica que las llaves correspondan al ambiente configurado.
 * En sandbox rechaza llaves de producción (y viceversa).
 */
export function validateWompiKeyPair(options: {
  environment: WompiEnvironment;
  publicKey: string;
  integritySecret: string;
}): string | null {
  const keyEnv = inferEnvironmentFromPublicKey(options.publicKey);
  const secretEnv = inferEnvironmentFromIntegritySecret(options.integritySecret);

  if (!keyEnv) {
    return "NEXT_PUBLIC_WOMPI_PUBLIC_KEY debe comenzar con pub_test_ o pub_prod_";
  }
  if (!secretEnv) {
    return "WOMPI_INTEGRITY_SECRET debe comenzar con test_integrity_ o prod_integrity_";
  }
  if (keyEnv !== secretEnv) {
    return "La llave pública y el secreto de integridad pertenecen a ambientes distintos";
  }
  if (keyEnv !== options.environment) {
    return `WOMPI_ENV=${options.environment} pero las llaves son de ${keyEnv}`;
  }
  return null;
}

export function getWompiPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim();
  if (!key) {
    throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY is not configured");
  }
  return key;
}
