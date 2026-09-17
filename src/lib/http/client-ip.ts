/**
 * Best-effort client IP for rate-limiting and audit keys.
 *
 * Prefer the leftmost `x-forwarded-for` entry (original client behind
 * Vercel / Hostinger / Cloudflare). Fall back to `x-real-ip`, then a
 * constant so local/dev still has a stable bucket key.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip")?.trim();
  if (xri) return xri;
  return "unknown";
}
