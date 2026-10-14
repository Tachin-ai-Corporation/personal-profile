// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import type { SessionData } from "@/lib/server/session"
import { TEST_SERVER_ENV } from "./test/env-fixture"

/**
 * The root request interceptor (AD-18, AD-21, D10, Story 1.6). The real env and
 * session modules run; `next/headers` / `next/navigation` are stubbed only so
 * importing `session.ts` works in node. The page's forwarded request headers
 * surface on the `NextResponse.next()` response as `x-middleware-request-*`.
 */

const SESSION_SECRET = "root-proxy-session-secret-0123456789abcdef"
const CLEARED = "__Host-pp_s=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
const T0 = 1_800_000_000_000
const MIN = 60_000

const BASE_ENV = { ...TEST_SERVER_ENV, SESSION_SECRET }

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.resetModules()
  vi.useRealTimers()
})

async function load() {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV }
  vi.doMock("next/headers", () => ({ cookies: vi.fn() }))
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  const { proxy } = await import("./proxy")
  const session = await import("@/lib/server/session")
  return { proxy, session }
}

function sessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt: T0 + 30 * MIN,
    environment: "demo",
    userId: 42,
    personId: 7,
    tenantId: 1,
    sid: "sid-root-1",
    gen: 0,
    iat: T0 - 60 * MIN,
    lastSeen: T0 - 5 * MIN,
    ...overrides,
  }
}

async function sealedValue(session: typeof import("@/lib/server/session"), data: SessionData): Promise<string> {
  const setCookie = await session.sealSession(data)
  return setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
}

function request(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers })
}

const NAVIGATE = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }

function assertSecurityHeaders(res: Response) {
  const csp = res.headers.get("content-security-policy") ?? ""
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  expect(res.headers.get("referrer-policy")).toBe("no-referrer")
  expect(res.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()")
  expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin")
  expect(res.headers.get("x-frame-options")).toBe("DENY")
}

function assertNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
}

/** The cookie header forwarded to the page (every request header is forwarded). */
function forwardedCookie(res: Response): string | null {
  return res.headers.get("x-middleware-request-cookie")
}

describe("existing behaviour", () => {
  it("/ without a cookie → next() with security + no-store headers, no Set-Cookie", async () => {
    const { proxy } = await load()
    const res = await proxy(request("/", NAVIGATE))
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("set-cookie")).toBeNull()
    assertSecurityHeaders(res)
    assertNoStore(res)
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeTruthy()
  })

  it("/?lpl= is not redirected or rewritten (no lpl handling, D1)", async () => {
    const { proxy } = await load()
    const res = await proxy(request("/?lpl=abc&tab=insurance", NAVIGATE))
    expect(res.status).toBe(200)
    expect(res.headers.get("location")).toBeNull()
    expect(res.headers.get("x-middleware-rewrite")).toBeNull()
    assertSecurityHeaders(res)
  })

  it.each(["/auth", "/api/token"])("%s gets security + no-store headers", async (path) => {
    const { proxy } = await load()
    const res = await proxy(request(path, NAVIGATE))
    assertSecurityHeaders(res)
    assertNoStore(res)
  })

  it.each(["/launch", "/launch/verify", "/launch-error"])("%s is no longer a no-store launch surface", async (path) => {
    const { proxy } = await load()
    const res = await proxy(request(path))
    assertSecurityHeaders(res)
    expect(res.headers.get("cache-control")).toBeNull()
  })

  it("a static asset gets security headers but no no-store", async () => {
    const { proxy } = await load()
    const res = await proxy(request("/favicon.png"))
    assertSecurityHeaders(res)
    expect(res.headers.get("cache-control")).toBeNull()
  })
})

describe("/ navigate activity (Story 1.6)", () => {
  it("valid cookie → re-sealed with lastSeen = now, Set-Cookie on the response and forwarded to the page", async () => {
    const { proxy, session } = await load()
    const before = sessionData()
    const original = await sealedValue(session, before)
    const res = await proxy(request("/?tab=contacts", { ...NAVIGATE, cookie: `other=1; __Host-pp_s=${original}` }))

    expect(res.status).toBe(200)
    assertSecurityHeaders(res)
    assertNoStore(res)

    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie.endsWith("; HttpOnly; Secure; SameSite=Lax; Path=/")).toBe(true)
    const renewed = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
    expect(await session.unsealSession(renewed)).toEqual({ ...before, lastSeen: T0 })

    expect(forwardedCookie(res)).toBe(`other=1; __Host-pp_s=${renewed}`)
  })

  it("only the session segment is rewritten: other cookies (percent-encoded, odd spacing) are forwarded byte for byte", async () => {
    const { proxy, session } = await load()
    const original = await sealedValue(session, sessionData())
    const raw = `pref=a%20b%3Bc%2C; __Host-pp_s=${original};theme=dark%7Cx; q="quoted%22"`
    const res = await proxy(request("/", { ...NAVIGATE, cookie: raw }))
    const setCookie = res.headers.get("set-cookie") ?? ""
    const renewed = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
    expect(renewed).not.toBe(original)
    expect(forwardedCookie(res)).toBe(raw.replace(original, renewed))
  })

  it.each([
    ["idle 15:01", { lastSeen: T0 - (15 * MIN + 1_000) }],
    ["absolute 8 h + 1 s", { iat: T0 - (8 * 60 * MIN + 1_000), lastSeen: T0 - MIN }],
  ])("%s → cookie cleared + 307 to /auth, security + no-store", async (_label, overrides) => {
    const { proxy, session } = await load()
    const cookie = `__Host-pp_s=${await sealedValue(session, sessionData(overrides))}`
    const res = await proxy(request("/?tab=insurance", { ...NAVIGATE, cookie }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    assertSecurityHeaders(res)
    assertNoStore(res)
  })

  it("idle 14:59 → still renewed", async () => {
    const { proxy, session } = await load()
    const cookie = `__Host-pp_s=${await sealedValue(session, sessionData({ lastSeen: T0 - (14 * MIN + 59_000) }))}`
    const res = await proxy(request("/", { ...NAVIGATE, cookie }))
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it("unsealable cookie → cleared + 307 to /auth", async () => {
    const { proxy } = await load()
    const res = await proxy(request("/", { ...NAVIGATE, cookie: "__Host-pp_s=Fe26.2*garbage" }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
  })

  it("a cookie sealed without an environment (pre-D1) → cleared + 307 to /auth", async () => {
    const { proxy, session } = await load()
    const { environment: _drop, ...legacy } = sessionData()
    void _drop
    const cookie = `__Host-pp_s=${await sealedValue(session, legacy as SessionData)}`
    const res = await proxy(request("/", { ...NAVIGATE, cookie }))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/auth")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
  })

  it.each([
    ["no Sec-Fetch-Mode", {}],
    ["Sec-Fetch-Mode: cors (RSC fetch)", { "sec-fetch-mode": "cors", rsc: "1" }],
    ["navigate + RSC header", { ...NAVIGATE, rsc: "1" }],
    ["navigate + Next-Router-Prefetch", { ...NAVIGATE, "next-router-prefetch": "1" }],
    ["navigate + Sec-Purpose: prefetch", { ...NAVIGATE, "sec-purpose": "prefetch" }],
  ])("%s → not activity: no re-seal, no redirect", async (_label, headers) => {
    const { proxy, session } = await load()
    const aged = `__Host-pp_s=${await sealedValue(session, sessionData({ lastSeen: T0 - 20 * MIN }))}`
    const valid = `__Host-pp_s=${await sealedValue(session, sessionData())}`
    for (const cookie of [valid, aged]) {
      const res = await proxy(request("/", { ...headers, cookie }))
      expect(res.status).toBe(200)
      expect(res.headers.get("set-cookie")).toBeNull()
      // The page receives the original, unchanged cookie.
      expect(forwardedCookie(res)).toBe(cookie)
      assertNoStore(res)
    }
  })

  it("a navigate to another path is not activity", async () => {
    const { proxy, session } = await load()
    const cookie = `__Host-pp_s=${await sealedValue(session, sessionData())}`
    const res = await proxy(request("/auth", { ...NAVIGATE, cookie }))
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})
