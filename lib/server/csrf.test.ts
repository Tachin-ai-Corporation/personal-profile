// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/** `csrf.ts` reads `APP_ORIGIN` from `env.ts` at load. */

const APP_ORIGIN = "https://personal-profile-demo.vercel.app"

const BASE_ENV = {
  APP_ENV: "demo",
  APP_ORIGIN,
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
  SESSION_SECRET: "csrf-session-secret-0123456789abcdef",
}

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

async function load() {
  return import("./csrf")
}

function req(headers: Record<string, string>): Request {
  return new Request("https://app.example/api/1h/v2/x", { method: "POST", headers })
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

  it("falls back to Origin === APP_ORIGIN when Sec-Fetch-Site is absent", async () => {
    const { checkCsrf } = await load()
    const ok = checkCsrf(req({ Origin: APP_ORIGIN, "X-PP-Session": "b" }), { requireBinding: true })
    expect(ok.ok).toBe(true)
    const bad = checkCsrf(req({ Origin: "https://evil.example", "X-PP-Session": "b" }), { requireBinding: true })
    expect(bad).toEqual({ ok: false, code: "CSRF" })
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
