import "server-only"

/**
 * =============================================================================
 * CSRF defence (AD-17)
 * =============================================================================
 *
 * INTERIM (R1): Story 1.3's rework (R2) deletes this file under D5. Until then
 * every state-changing request must prove it originated from this app's own page:
 *
 *   - `Sec-Fetch-Site: same-origin` (sent by modern browsers on `fetch`), or,
 *     when `Sec-Fetch-Site` is absent, `Origin` exactly equal to the request's
 *     own origin (`new URL(request.url).origin`; one deployment serves several
 *     hosts, so there is no configured app origin);
 *   - and the `X-PP-Session` binding header, which only `callApi` sets.
 *
 * A request carrying neither `Sec-Fetch-Site` nor `Origin` is rejected. The HMAC
 * value of `X-PP-Session` is verified separately in `session-binding.ts`; here we
 * only require its presence (`requireBinding`).
 *
 * This helper is reused by the later `/api/session/*`, `/api/places/*` and
 * `/api/pp/*` route groups, which call it for their non-GET handlers.
 * =============================================================================
 */

export type CsrfResult = { ok: true } | { ok: false; code: "CSRF" }

const FAIL: CsrfResult = { ok: false, code: "CSRF" }

/**
 * Enforce the same-origin + `X-PP-Session` rules (AD-17). Intended for
 * state-changing (non-GET) requests; GET handlers gate the binding header
 * themselves (the proxy's `asImage` rule).
 *
 * @param requireBinding require the `X-PP-Session` header to be present.
 */
export function checkCsrf(request: Request, opts: { requireBinding?: boolean } = {}): CsrfResult {
  const secFetchSite = request.headers.get("Sec-Fetch-Site")
  const origin = request.headers.get("Origin")

  let originOk: boolean
  if (secFetchSite !== null) {
    originOk = secFetchSite === "same-origin"
  } else if (origin !== null) {
    let own: string | null = null
    try {
      own = new URL(request.url).origin
    } catch {
      own = null
    }
    originOk = own !== null && origin === own
  } else {
    // Neither Sec-Fetch-Site nor Origin — cannot establish same-origin.
    originOk = false
  }
  if (!originOk) return FAIL

  if (opts.requireBinding) {
    const binding = request.headers.get("X-PP-Session")
    if (!binding) return FAIL
  }

  return { ok: true }
}
