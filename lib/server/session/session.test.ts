import { beforeEach, describe, expect, it, vi } from "vitest"
import { stubServerEnv, TEST_ENV } from "@/test/env-fixture"
import { makeSession } from "@/test/session-fixture"
import { rememberedEnvironment, requirePageSession } from "@/lib/server/page-session"
import { ENVIRONMENT_COOKIE, environmentSetCookie, parseEnvironmentCookie, resolveEnvironment } from "./environment-cookie"
import {
  buildSessionSetCookie,
  clearSessionSetCookie,
  getSession,
  MAX_SET_COOKIE_BYTES,
  newSid,
  readCookie,
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

  it("getSession reads the request cookie", async () => {
    const session = makeSession()
    const seal = await sealSession(session)
    const request = new Request("http://localhost/api", { headers: { cookie: `other=1; ${SESSION_COOKIE}=${seal}` } })
    expect(await getSession(request)).toEqual(session)
    expect(await getSession(new Request("http://localhost/api"))).toBeNull()
  })

  it("requireSession returns the session or redirects to /auth", async () => {
    await expect(requireSession()).rejects.toThrow("REDIRECT:/auth")
    const session = makeSession({ environment: "prod" })
    cookieJar.set(SESSION_COOKIE, await sealSession(session))
    expect(await requireSession()).toEqual(session)
  })

  it("requirePageSession embeds only the session's portal URL, never a token or binding", async () => {
    await expect(requirePageSession()).rejects.toThrow("REDIRECT:/auth")
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ environment: "demo" })))
    expect(await requirePageSession()).toEqual({ portalUrl: "https://1health.demo.1health.io" })
  })

  it("rememberedEnvironment reads only a known onehealth_environment value", async () => {
    expect(await rememberedEnvironment()).toBeNull()
    cookieJar.set(ENVIRONMENT_COOKIE, "demo")
    expect(await rememberedEnvironment()).toBe("demo")
    cookieJar.set(ENVIRONMENT_COOKIE, "dev")
    expect(await rememberedEnvironment()).toBeNull()
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
  })
})
