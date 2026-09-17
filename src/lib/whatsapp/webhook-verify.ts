import { decrypt, encrypt, isLegacyFormat } from "@/lib/whatsapp/encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashVerifyToken } from "@/lib/whatsapp/verify-token-hash";

/**
 * Resolve a Meta hub.verify_token against stored configs.
 * Prefer hash lookup; only decrypt rows that still lack verify_token_hash.
 */
export async function matchWhatsAppVerifyToken(
  verifyToken: string,
): Promise<{ id: string; verify_token: string } | null> {
  const admin = supabaseAdmin();
  const incomingHash = hashVerifyToken(verifyToken);

  const { data: hashed, error: hashedErr } = await admin
    .from("whatsapp_config")
    .select("id, verify_token")
    .eq("verify_token_hash", incomingHash)
    .maybeSingle();

  if (!hashedErr && hashed) return hashed;

  const { data: unhashed, error: unhashedErr } = await admin
    .from("whatsapp_config")
    .select("id, verify_token")
    .is("verify_token_hash", null);

  if (unhashedErr || !unhashed) return null;

  for (const config of unhashed) {
    if (!config.verify_token) continue;
    try {
      if (decrypt(config.verify_token) !== verifyToken) continue;
    } catch {
      continue;
    }

    const upgrade: { verify_token_hash: string; verify_token?: string } = {
      verify_token_hash: incomingHash,
    };
    if (isLegacyFormat(config.verify_token)) {
      upgrade.verify_token = encrypt(verifyToken);
    }
    void admin
      .from("whatsapp_config")
      .update(upgrade)
      .eq("id", config.id)
      .then(({ error }: { error: { message?: string } | null }) => {
        if (error) {
          console.warn(
            "[webhook] verify_token hash backfill failed:",
            error.message ?? error,
          );
        }
      });
    return config;
  }

  return null;
}
