import { createHash } from "node:crypto";

/** SHA-256 hex of the plaintext Meta hub.verify_token. */
export function hashVerifyToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
