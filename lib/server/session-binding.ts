import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { SESSION_SECRET } from "./env"

/**
 * =============================================================================
 * Per-tab session binding (AD-17)
 * =============================================================================
 *
 * `app/page.tsx` embeds `sessionBinding = base64url(HMAC-SHA256(SESSION_SECRET,
 * sid))` in the page (a later story); `callApi` echoes it back as `X-PP-Session`
 * on every request (Story 1.4). The proxy compares the header against the binding
 * of the CURRENT cookie's `sid`: a mismatch means the tab's page was issued for a
 * different session than the one the cookie now carries (another account launched
 * in another tab), which must be rejected with `SESSION_CHANGED` (AD-17).
 *
 * The comparison is constant-time to avoid leaking the expected value byte by
 * byte. The length is checked first so `timingSafeEqual` never throws on
 * unequal-length buffers.
 * =============================================================================
 */

/** `base64url(HMAC-SHA256(SESSION_SECRET, sid))` — the value the page embeds (AD-17). */
export function computeBinding(sid: string): string {
  return createHmac("sha256", SESSION_SECRET).update(sid).digest("base64url")
}

/**
 * Constant-time check that `header` equals `computeBinding(sid)`. A `null`/empty
 * header, or any length mismatch, returns `false` without throwing.
 */
export function verifyBinding(header: string | null | undefined, sid: string): boolean {
  if (!header) return false
  const expected = computeBinding(sid)
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  // Length check first: timingSafeEqual throws on unequal-length buffers.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
