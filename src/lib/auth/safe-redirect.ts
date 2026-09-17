/**
 * Valida rutas internas de redirección post-login para evitar open redirects.
 *
 * Rechaza:
 *   - URLs absolutas / protocol-relative (`//evil.com`)
 *   - backslash tricks (`/\evil`)
 *   - userinfo / `@` tricks
 *   - percent-encoding that decodes to `//` or `\`
 */
export function isSafeRedirectPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 2048) {
    return false;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("\0") || path.includes("@")) {
    return false;
  }

  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("@") ||
    /^[a-zA-Z][a-zA-Z+\-.]*:/.test(decoded)
  ) {
    return false;
  }

  return true;
}
