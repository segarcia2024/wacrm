import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Raíz real de la app (evita que Next infiera el monorepo padre REVIO CRM). */
const appRoot = __dirname;

/**
 * Baseline security headers applied to every response.
 *
 * CSP is enforced (not Report-Only). Next.js still needs
 * `'unsafe-inline'` / `'unsafe-eval'` for hydration until a nonce
 * rollout; Meta Embedded Signup and Wompi checkout are allowlisted
 * explicitly so those third parties keep working under enforce.
 *
 * The rest of the headers are straight blocks:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: microphone stays same-origin for voice notes;
 *     camera / geo / payment / usb stay denied.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Microphone is allowed for same-origin (`self`) so the inbox
    // composer can record voice notes via MediaRecorder. Everything
    // else stays denied — a compromised dependency can't silently grab
    // the camera / geolocation / etc.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline hydration script
      // and 'unsafe-eval' in dev + some production optimisations.
      // Meta SDK + Wompi widget are the only third-party script hosts.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://checkout.wompi.co",
      // Tailwind + inline style attributes on lots of components.
      "style-src 'self' 'unsafe-inline'",
      // Supabase public-bucket avatars, contact avatars (arbitrary
      // https URLs paste-able from the UI), OG images, data URLs for
      // tiny inline assets.
      "img-src 'self' data: blob: https:",
      // Outbound media previews (blob: from MediaRecorder + file picker)
      // and Supabase public-bucket audio/video the inbox renders.
      "media-src 'self' blob: https://*.supabase.co",
      "font-src 'self' data:",
      // Supabase REST + realtime; Meta SDK + Wompi checkout callbacks.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://connect.facebook.net https://www.facebook.com https://web.facebook.com https://graph.facebook.com https://*.wompi.co",
      // Embedded Signup / Wompi widget frames.
      "frame-src https://www.facebook.com https://web.facebook.com https://checkout.wompi.co",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Only in production — breaks plain http://localhost in `next dev`.
      ...(process.env.NODE_ENV === "production"
        ? ["upgrade-insecure-requests"]
        : []),
    ].join("; "),
  },
] as const;

const nextConfig: NextConfig = {
  /** Salida mínima para despliegue Docker (ver DEPLOYMENT.md). */
  output: "standalone",
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  experimental: {
    // Dev was wedging on "○ Compiling /notifications ..." while Turbopack
    // compacted a multi-GB persistent FS cache (see terminal: compaction
    // 87s+ with .next/dev/cache ~1.9GB). Disable until Next hardens pruning.
    turbopackFileSystemCacheForDev: false,
  },

  /**
   * Cache-Control policy.
   *
   * Why this exists:
   *   Hostinger's CDN was applying `s-maxage=31536000` (1 year) to
   *   prerendered HTML pages by default. When a new deploy shipped
   *   fresh Turbopack chunk hashes, the edge kept serving year-old
   *   HTML referencing chunk filenames that no longer existed on
   *   disk — result: HTML 200, every /_next/static/*.js and .css
   *   came back 404, the page rendered unstyled. Private/incognito
   *   did nothing because the cache is server-side.
   *
   * Strategy:
   *   - /_next/static/* — leave to Next. Turbopack dev chunks can go
   *     stale if we force immutable caching here; Next already emits
   *     the correct production headers for hashed assets.
   *   - /api/*          — no-store. API responses are per-user and
   *     must never be shared across requests at the edge.
   *   - Everything else — public, brief s-maxage + generous
   *     stale-while-revalidate. The edge serves instantly from cache
   *     for the first 5 min, then returns cached content while
   *     refreshing in the background for up to 24 h. A deploy's
   *     chunk-hash drift self-heals within ~5 min with no user-
   *     visible latency.
   *
   *   Note: dynamic dashboard routes (/inbox, /contacts, /pipelines,
   *   /broadcasts, etc.) are server-rendered per request — Next.js
   *   and Supabase auth already prevent them from being served
   *   from a shared cache. The s-maxage here is a ceiling; Next.js
   *   and auth middleware still set `private` / `no-store` for
   *   per-user responses.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/:path((?!_next/static|_next/image|api).*)",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
