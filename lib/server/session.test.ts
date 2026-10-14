// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sealData } from "iron-session"

/**
 * `lib/server/session.ts` reads `SESSION_SECRET` / `SESSION_SECRET_PREVIOUS` from
 * `lib/server/env.ts` at load, so each case sets `process.env` and imports the
 * module fresh. `next/headers` and `next/navigation` are mocked so importing the
 * module (which pulls them in) works in the node test environment.
 */

vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

const CURRENT = "current-session-secret-0123456789abcdef"
const PREVIOUS = "previous-session-secret-0123456789abcdef"

const BASE_ENV = {
  APP_ENV: "demo",
  APP_ORIGIN: "https://personal-profile-demo.vercel.app",
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
}

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.resetModules()
  vi.clearAllMocks()
})

async function loadSession(vars: Record<string, string>) {
  vi.resetModules()
  const next: NodeJS.ProcessEnv = { ...ORIGINAL_ENV }
  for (const key of ["SESSION_SECRET", "SESSION_SECRET_PREVIOUS", ...Object.keys(BASE_ENV)]) delete next[key]
  Object.assign(next, BASE_ENV, vars)
  process.env = next
  return import("./session")
}

/** A session with a realistically large (≥ 1,224-byte) access token. */
function largeSession() {
  return {
    accessToken: "x".repeat(1400),
    refreshToken: "r".repeat(600),
    accessTokenExpiresAt: 1_900_000_000_000,
    userId: 4_294_967_295,
    personId: 4_294_967_294,
    tenantId: 1,
    sid: "a".repeat(32),
    gen: 0,
    iat: 1_800_000_000_000,
    lastSeen: 1_800_000_000_000,
  }
}

/** Pull the sealed value out of a `Set-Cookie` string. */
function sealOf(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf("=") + 1, setCookie.indexOf(";"))
}

describe("sealSession — cookie attributes", () => {
  it("names the cookie __Host-pp_s with the exact attribute string", async () => {
    const { sealSession } = await loadSession({ SESSION_SECRET: CURRENT })
    const cookie = await sealSession(largeSession())
    expect(cookie.startsWith("__Host-pp_s=")).toBe(true)
    expect(cookie.endsWith("; HttpOnly; Secure; SameSite=None; Partitioned; Path=/")).toBe(true)
    // No Domain / Max-Age / Expires on the live session cookie.
    expect(cookie).not.toMatch(/Domain/i)
    expect(cookie).not.toMatch(/Max-Age/i)
    expect(cookie).not.toMatch(/Expires/i)
  })

  it("clearSessionCookie clears __Host-pp_s with Max-Age=0 and the same attributes", async () => {
    const { clearSessionCookie } = await loadSession({ SESSION_SECRET: CURRENT })
    const cookie = clearSessionCookie()
    expect(cookie).toBe("__Host-pp_s=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0")
  })
})

describe("sealSession — cookie size budget", () => {
  it("serializes to ≤ 3,800 bytes with the largest fixtures", async () => {
    const { sealSession } = await loadSession({ SESSION_SECRET: CURRENT })
    const cookie = await sealSession(largeSession())
    expect(Buffer.byteLength(cookie, "utf8")).toBeLessThanOrEqual(3800)
  })
})

describe("session — seal / unseal round-trip", () => {
  it("unseals what it sealed", async () => {
    const { sealSession, unsealSession } = await loadSession({ SESSION_SECRET: CURRENT })
    const data = largeSession()
    const restored = await unsealSession(sealOf(await sealSession(data)))
    expect(restored).toMatchObject({ sid: data.sid, userId: data.userId, personId: data.personId })
  })

  it("returns null for a missing or garbage cookie", async () => {
    const { unsealSession } = await loadSession({ SESSION_SECRET: CURRENT })
    expect(await unsealSession(undefined)).toBeNull()
    expect(await unsealSession("")).toBeNull()
    expect(await unsealSession("not-a-valid-seal")).toBeNull()
  })
})

describe("session — secret rotation", () => {
  it("unseals a previous-secret cookie during overlap, rejects it once the var is removed, and seals under the current secret", async () => {
    const data = largeSession()
    // A cookie as a prior deployment sealed it under the previous secret (id 1).
    const oldSeal = await sealData(data, { password: { "1": PREVIOUS }, ttl: 0 })

    // Overlap: current + previous both set.
    const overlap = await loadSession({ SESSION_SECRET: CURRENT, SESSION_SECRET_PREVIOUS: PREVIOUS })
    expect(await overlap.unsealSession(oldSeal)).toMatchObject({ sid: data.sid })

    // New cookies seal under the current secret and still unseal during overlap.
    const newSeal = sealOf(await overlap.sealSession(data))
    expect(await overlap.unsealSession(newSeal)).toMatchObject({ sid: data.sid })

    // After the previous var is removed, the old cookie is rejected, the new one still opens.
    const afterRotation = await loadSession({ SESSION_SECRET: CURRENT })
    expect(await afterRotation.unsealSession(oldSeal)).toBeNull()
    expect(await afterRotation.unsealSession(newSeal)).toMatchObject({ sid: data.sid })
  })
})
