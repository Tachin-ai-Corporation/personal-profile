// @vitest-environment node
import { describe, expect, it } from "vitest"

/**
 * `csrf.ts` (interim until R2 deletes it): the `Origin` fallback compares with
 * the request's own origin; there is no configured app origin (D1).
 */

/** The request's own origin. */
const SELF_ORIGIN = "https://app.example"

async function load() {
  return import("./csrf")
}

function req(headers: Record<string, string>, url = `${SELF_ORIGIN}/api/1h/v2/x`): Request {
  return new Request(url, { method: "POST", headers })
}

describe("checkCsrf — origin rules", () => {
  it("accepts Sec-Fetch-Site: same-origin with a binding header", async () => {
    const { checkCsrf } = await load()
    const r = checkCsrf(req({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": "b" }), { requireBinding: true })
    expect(r.ok).toBe(true)
  })

  it("rejects Sec-Fetch-Site: cross-site", async () => {
    const { checkCsrf } = await load()
    const r = checkCsrf(req({ "Sec-Fetch-Site": "cross-site", "X-PP-Session": "b" }), { requireBinding: true })
    expect(r).toEqual({ ok: false, code: "CSRF" })
  })

  it("falls back to Origin === the request's own origin when Sec-Fetch-Site is absent", async () => {
    const { checkCsrf } = await load()
    const ok = checkCsrf(req({ Origin: SELF_ORIGIN, "X-PP-Session": "b" }), { requireBinding: true })
    expect(ok.ok).toBe(true)
    const bad = checkCsrf(req({ Origin: "https://evil.example", "X-PP-Session": "b" }), { requireBinding: true })
    expect(bad).toEqual({ ok: false, code: "CSRF" })
  })

  it("follows the request host: another host's origin, or another scheme, is rejected", async () => {
    const { checkCsrf } = await load()
    const preview = "https://pp-preview-123.vercel.app"
    expect(checkCsrf(req({ Origin: preview, "X-PP-Session": "b" }, `${preview}/api/x`)).ok).toBe(true)
    expect(checkCsrf(req({ Origin: SELF_ORIGIN, "X-PP-Session": "b" }, `${preview}/api/x`)).ok).toBe(false)
    expect(checkCsrf(req({ Origin: "http://app.example", "X-PP-Session": "b" })).ok).toBe(false)
  })

  it("rejects when neither Sec-Fetch-Site nor Origin is present", async () => {
    const { checkCsrf } = await load()
    const r = checkCsrf(req({ "X-PP-Session": "b" }), { requireBinding: true })
    expect(r).toEqual({ ok: false, code: "CSRF" })
  })
})

describe("checkCsrf — binding presence", () => {
  it("rejects a missing X-PP-Session when requireBinding is set", async () => {
    const { checkCsrf } = await load()
    const r = checkCsrf(req({ "Sec-Fetch-Site": "same-origin" }), { requireBinding: true })
    expect(r).toEqual({ ok: false, code: "CSRF" })
  })

  it("does not require the binding header when requireBinding is false", async () => {
    const { checkCsrf } = await load()
    const r = checkCsrf(req({ "Sec-Fetch-Site": "same-origin" }), { requireBinding: false })
    expect(r.ok).toBe(true)
  })
})
