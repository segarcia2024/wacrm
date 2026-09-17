/**
 * WHATSAPP_TEMPLATES_DRY_RUN must never skip Meta in production.
 * Allowed only outside NODE_ENV=production (local/CI).
 */
export function isWhatsappTemplatesDryRun(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === "true" ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === "1"
  );
}
