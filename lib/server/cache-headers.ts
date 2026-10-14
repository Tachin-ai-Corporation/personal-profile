import "server-only"

/**
 * =============================================================================
 * No-store cache headers (AD-18)
 * =============================================================================
 *
 * The single source of truth for the "never cache this" header trio. PHI must
 * never be cached by the Next data cache, the Vercel edge, or a shared browser
 * cache, so every BFF/page response on a PHI-bearing surface overwrites its
 * caching headers with these values.
 *
 * `proxy.ts` applies these to the page surfaces (`/`, `/auth`); route handlers
 * (`/api/token`, `/api/session/*`, `/api/1h/*`) apply them to their own responses.
 * =============================================================================
 */

/** The exact no-store header trio (AD-18). */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
}

/** Overwrite the no-store trio onto a `Headers` object, dropping any prior caching values. */
export function applyNoStore(headers: Headers): Headers {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value)
  }
  return headers
}
