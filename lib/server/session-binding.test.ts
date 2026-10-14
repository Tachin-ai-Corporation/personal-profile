// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"

/**
 * `session-binding.ts` reads `SESSION_SECRET` from `env.ts` at load, so set the
 * env and import fresh. The expected binding is computed independently here with
 * the same secret.
 */

const SECRET = "binding-session-secret-0123456789abcdef"

const BASE_ENV = {
  APP_ENV: "demo",
  APP_ORIGIN: "https://personal-profile-demo.vercel.app",
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
  SESSION_SECRET: SECRET,
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
  return import("./session-binding")
}

function expectedBinding(sid: string): string {
  return createHmac("sha256", SECRET).update(sid).digest("base64url")
}

describe("computeBinding", () => {
  it("is base64url(HMAC-SHA256(SESSION_SECRET, sid))", async () => {
    const { computeBinding } = await load()
    const sid = "sid-abc-123"
    expect(computeBinding(sid)).toBe(expectedBinding(sid))
  })

  it("is url-safe base64 (no +, /, or = padding)", async () => {
    const { computeBinding } = await load()
    const value = computeBinding("another-sid-value")
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("differs for different sids", async () => {
    const { computeBinding } = await load()
    expect(computeBinding("sid-a")).not.toBe(computeBinding("sid-b"))
  })
})

describe("verifyBinding", () => {
  it("accepts the matching binding", async () => {
    const { computeBinding, verifyBinding } = await load()
    const sid = "sid-xyz"
    expect(verifyBinding(computeBinding(sid), sid)).toBe(true)
  })

  it("rejects a mismatched binding (right length, wrong value)", async () => {
    const { computeBinding, verifyBinding } = await load()
    const wrong = computeBinding("other-sid")
    expect(verifyBinding(wrong, "sid-xyz")).toBe(false)
  })

  it("rejects a binding for a different sid", async () => {
    const { computeBinding, verifyBinding } = await load()
    expect(verifyBinding(computeBinding("sid-a"), "sid-b")).toBe(false)
  })

  it("rejects null, undefined, and empty without throwing", async () => {
    const { verifyBinding } = await load()
    expect(verifyBinding(null, "sid")).toBe(false)
    expect(verifyBinding(undefined, "sid")).toBe(false)
    expect(verifyBinding("", "sid")).toBe(false)
  })

  it("rejects a value of a different length without throwing", async () => {
    const { verifyBinding } = await load()
    expect(verifyBinding("short", "sid")).toBe(false)
    expect(verifyBinding("x".repeat(500), "sid")).toBe(false)
  })
})
