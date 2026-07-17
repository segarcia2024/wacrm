/**
 * Valida rutas internas de redirección post-login para evitar open redirects.
 */
export function isSafeRedirectPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("\0")) return false;
  return true;
}
