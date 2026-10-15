import { beforeEach, describe, expect, it, vi } from "vitest"
import { stubServerEnv, TEST_DEV_ENV, TEST_ENV } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { configuredEnvironments, rememberedEnvironment, requirePageSession } from "@/lib/server/page-session"
import { ENVIRONMENT_COOKIE, environmentSetCookie, parseEnvironmentCookie, resolveEnvironment } from "./environment-cookie"
import {
  ABSOLUTE_TIMEOUT_MS,
  buildSessionSetCookie,
  clearSessionSetCookie,
  getSession,
  hasSessionCookie,
  IDLE_TIMEOUT_MS,
  isSessionAged,
  MAX_SET_COOKIE_BYTES,
  newSid,
  readCookie,
  renewLastSeen,
  requireSession,
  sealSession,
  SESSION_COOKIE,
  sessionSetCookie,
  unsealSession,
} from "./session"

const cookieJar = new Map<string, string>()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

const OLD = "o".repeat(40)
const NEW = "n".repeat(40)

beforeEach(() => {
  cookieJar.clear()
  stubServerEnv()
})

describe("seal / unseal", () => {
  it("round-trips the payload with the env secret", async () => {
    const session = makeSession()
    expect(await unsealSession(await sealSession(session))).toEqual(session)
  })

  it("treats missing, tampered or foreign cookies as no session", async () => {
    expect(await unsealSession(undefined)).toBeNull()
    expect(await unsealSession("")).toBeNull()
    expect(await unsealSession("Fe26.2*garbage")).toBeNull()
    const foreign = await sealSession(makeSession(), { current: "f".repeat(40) })
    expect(await unsealSession(foreign)).toBeNull()
  })

  it("applies the 8 h per-seal TTL (plus iron-session's 60 s skew)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const sealedAt = new Date("2026-10-14T08:00:00Z").getTime()
      vi.setSystemTime(sealedAt)
      const seal = await sealSession(makeSession())
      vi.setSystemTime(sealedAt + 8 * 3600_000 - 1000)
      expect(await unsealSession(seal)).not.toBeNull()
      vi.setSystemTime(sealedAt + 8 * 3600_000 + 61_000)
      expect(await unsealSession(seal)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects a sealed value that is not a session payload", async () => {
    const { sealData } = await import("iron-session")
    const seal = await sealData({ hello: "world" }, { password: TEST_ENV.SESSION_SECRET })
    expect(await unsealSession(seal)).toBeNull()
  })

  it("rotates: previous secret unseals while set, new seals use the current one", async () => {
    const oldCookie = await sealSession(makeSession(), { current: OLD })
    expect(await unsealSession(oldCookie, { current: NEW, previous: OLD })).not.toBeNull()
    expect(await unsealSession(oldCookie, { current: NEW })).toBeNull()

    const fresh = await sealSession(makeSession(), { current: NEW, previous: OLD })
    expect(await unsealSession(fresh, { current: NEW })).not.toBeNull()
    expect(await unsealSession(fresh, { current: OLD })).toBeNull()
  })
})

describe("cookie serialization", () => {
  it("sets exactly HttpOnly; Secure; SameSite=Lax; Path=/ with no Max-Age, Domain or Partitioned", () => {
    const header = sessionSetCookie("SEAL")
    expect(header).toBe(`${SESSION_COOKIE}=SEAL; Path=/; HttpOnly; Secure; SameSite=Lax`)
    expect(header).not.toMatch(/Max-Age|Expires|Domain|Partitioned/i)
  })

  it("clears with the same attributes and Max-Age=0", () => {
    expect(clearSessionSetCookie()).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  })

  it("stays within 3,800 bytes with the largest observed tokens", async () => {
    // 1,224-byte RS256 access token (measured) + an 800-byte refresh token (measured opaque, with headroom).
    const header = await buildSessionSetCookie(makeSession({ refreshToken: "r".repeat(800) }))
    expect(Buffer.byteLength(header)).toBeLessThanOrEqual(MAX_SET_COOKIE_BYTES)
  })

  it("refuses a cookie over budget", async () => {
    await expect(buildSessionSetCookie(makeSession({ refreshToken: "r".repeat(4000) }))).rejects.toThrow("3800")
  })

  it("creates 128-bit sids", () => {
    expect(Buffer.from(newSid(), "base64url")).toHaveLength(16)
    expect(newSid()).not.toBe(newSid())
  })
})

describe("reading the session", () => {
  it("parses the Cookie header", () => {
    expect(readCookie(null, "a")).toBeUndefined()
    expect(readCookie("junk; x=1; a=2=3", "a")).toBe("2=3")
    expect(readCookie("x=1", "a")).toBeUndefined()
  })

  it("getSession reads the request cookie (real clock by default)", async () => {
    const session = makeSession({ iat: Date.now(), lastSeen: Date.now() })
    const seal = await sealSession(session)
    const request = new Request("http://localhost/api", { headers: { cookie: `other=1; ${SESSION_COOKIE}=${seal}` } })
    expect(await getSession(request)).toEqual(session)
    expect(await getSession(new Request("http://localhost/api"))).toBeNull()
  })

  it("requireSession returns the session or redirects to /auth", async () => {
    await expect(requireSession()).rejects.toThrow("REDIRECT:/auth")
    const session = makeSession({ environment: "prod", iat: Date.now(), lastSeen: Date.now() })
    cookieJar.set(SESSION_COOKIE, await sealSession(session))
    expect(await requireSession()).toEqual(session)
  })

  it("requirePageSession embeds only the portal URL and the four idle numbers, never a token or binding", async () => {
    await expect(requirePageSession(NOW)).rejects.toThrow("REDIRECT:/auth")
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ environment: "demo", iat: NOW - 60_000, lastSeen: NOW - 5_000 })))
    expect(await requirePageSession(NOW)).toEqual({
      portalUrl: "https://1health.demo.1health.io",
      idle: { idleTimeoutSec: 900, lastSeen: NOW - 5_000, absoluteExpiresAt: NOW - 60_000 + 8 * 3600_000, serverNow: NOW },
    })
  })

  it("requirePageSession uses the real clock by default", async () => {
    const before = Date.now()
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ iat: before, lastSeen: before })))
    const { idle } = await requirePageSession()
    expect(idle.serverNow).toBeGreaterThanOrEqual(before)
  })

  it("rememberedEnvironment reads only a known onehealth_environment value", async () => {
    expect(await rememberedEnvironment()).toBeNull()
    cookieJar.set(ENVIRONMENT_COOKIE, "demo")
    expect(await rememberedEnvironment()).toBe("demo")
    cookieJar.set(ENVIRONMENT_COOKIE, "staging")
    expect(await rememberedEnvironment()).toBeNull()
  })

  it("rememberedEnvironment ignores a remembered dev while dev is not configured (D18)", async () => {
    cookieJar.set(ENVIRONMENT_COOKIE, "dev")
    expect(await rememberedEnvironment()).toBeNull()
    expect(configuredEnvironments()).toEqual(["demo", "prod"])
    stubServerEnv(TEST_DEV_ENV)
    expect(await rememberedEnvironment()).toBe("dev")
    expect(configuredEnvironments()).toEqual(["demo", "prod", "dev"])
  })

  it("requirePageSession embeds the dev portal URL for a dev session", async () => {
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ environment: "dev", iat: NOW - 60_000, lastSeen: NOW - 5_000 })))
    expect((await requirePageSession(NOW)).portalUrl).toBe("https://dev.1hdev.io")
  })
})

describe("idle and absolute limits (Story 1.6, AD-16)", () => {
  const MIN = 60_000
  const sealed = async (overrides: Parameters<typeof makeSession>[0]) =>
    new Request("http://localhost/api", { headers: { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession(overrides))}` } })

  it("limits are 15 min idle and 8 h absolute", () => {
    expect(IDLE_TIMEOUT_MS).toBe(15 * MIN)
    expect(ABSOLUTE_TIMEOUT_MS).toBe(8 * 60 * MIN)
  })

  it.each([
    ["idle 14:59", { lastSeen: NOW - (15 * MIN - 1_000) }, false],
    ["idle 15:00 exactly", { lastSeen: NOW - 15 * MIN }, false],
    ["idle 15:01", { lastSeen: NOW - (15 * MIN + 1_000) }, true],
    ["absolute 8 h exactly", { iat: NOW - 8 * 60 * MIN, lastSeen: NOW - MIN }, false],
    ["absolute 8 h + 1 s with recent activity", { iat: NOW - (8 * 60 * MIN + 1_000), lastSeen: NOW - MIN }, true],
  ])("%s → aged %s, and getSession treats an aged session as none", async (_label, overrides, aged) => {
    expect(isSessionAged(makeSession(overrides), NOW)).toBe(aged)
    const session = await getSession(await sealed(overrides), NOW)
    expect(session === null).toBe(aged)
  })

  it("requireSession redirects an aged session to /auth", async () => {
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ lastSeen: NOW - 16 * MIN })))
    await expect(requireSession(NOW)).rejects.toThrow("REDIRECT:/auth")
    await expect(requirePageSession(NOW)).rejects.toThrow("REDIRECT:/auth")
  })

  it("hasSessionCookie is true for any sent session cookie, valid or not", () => {
    expect(hasSessionCookie(new Request("http://localhost/api"))).toBe(false)
    expect(hasSessionCookie(new Request("http://localhost/api", { headers: { cookie: "other=1" } }))).toBe(false)
    expect(hasSessionCookie(new Request("http://localhost/api", { headers: { cookie: `${SESSION_COOKIE}=garbage` } }))).toBe(true)
  })

  it("renewLastSeen re-seals with lastSeen = now and nothing else changed", async () => {
    const session = makeSession({ lastSeen: NOW - 5 * MIN })
    const header = await renewLastSeen(session, NOW)
    expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=.+; Path=/; HttpOnly; Secure; SameSite=Lax$`))
    expect(await unsealSession(header.slice(SESSION_COOKIE.length + 1, header.indexOf(";")))).toEqual({ ...session, lastSeen: NOW })
  })
})

describe("environment cookie (D4)", () => {
  it("is non-secret, HttpOnly, Secure, Lax, 30 days", () => {
    expect(environmentSetCookie("prod")).toBe("onehealth_environment=prod; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000")
  })

  it("resolves session, else cookie, else prod", () => {
    expect(resolveEnvironment("demo", "prod")).toBe("demo")
    expect(resolveEnvironment(null, "demo")).toBe("demo")
    expect(resolveEnvironment(null, "nope")).toBe("prod")
    expect(resolveEnvironment(null, undefined)).toBe("prod")
    expect(parseEnvironmentCookie("prod")).toBe("prod")
    expect(resolveEnvironment("dev", "prod")).toBe("dev")
  })

  it("accepts dev only when configured (default: every environment)", () => {
    expect(environmentSetCookie("dev")).toBe("onehealth_environment=dev; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000")
    expect(parseEnvironmentCookie("dev")).toBe("dev")
    expect(parseEnvironmentCookie("dev", ["demo", "prod"])).toBeNull()
    expect(parseEnvironmentCookie("demo", ["demo", "prod"])).toBe("demo")
  })
})
