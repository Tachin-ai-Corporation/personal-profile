/**
 * AD-21 security headers, set on every response by `proxy.ts`.
 *
 * Deliberately free of `server-only` and env access: `proxy.ts` must be able
 * to set these even when the app is misconfigured.
 */

/** 128 bits of randomness, base64. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * The exact AD-21 CSP. `allowEval` adds `'unsafe-eval'` for `next dev` only
 * (React's dev tooling needs it); production never gets it.
 */
export function buildCsp(nonce: string, allowEval = false): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(allowEval ? ["'unsafe-eval'"] : [])]
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ")
}

/** The non-CSP AD-21 headers. */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
}

/** Every AD-21 header for one response. */
export function securityHeaders(nonce: string, allowEval = false): Record<string, string> {
  return { "Content-Security-Policy": buildCsp(nonce, allowEval), ...STATIC_SECURITY_HEADERS }
}
