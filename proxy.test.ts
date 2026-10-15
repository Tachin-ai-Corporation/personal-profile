import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetServerEnvCache } from "@/lib/server/env"
import { SESSION_COOKIE, sealSession, unsealSession } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { stubServerEnv } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { isNoStorePath, proxy } from "./proxy"

/**
 * The root request interceptor: AD-21 headers everywhere, and the Story 1.6
 * navigation activity on `/` and `/account`. The page's forwarded request
 * headers surface on `NextResponse.next()` as `x-middleware-request-*`.
 */

const MIN = 60_000
const CLEARED = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
const NAVIGATE = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }

beforeEach(() => {
  stubServerEnv()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => vi.useRealTimers())

const request = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  new NextRequest(`http://localhost:3000${path}`, { method, headers })

const cookieFor = async (overrides: Partial<SessionPayload> = {}) => `${SESSION_COOKIE}=${await sealSession(makeSession(overrides))}`

const sealOf = (setCookie: string) => setCookie.slice(SESSION_COOKIE.length + 1, setCookie.indexOf(";"))

function expectSecurityHeaders(response: Response): void {
  const csp = response.headers.get("Content-Security-Policy") ?? ""
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{16,}' 'strict-dynamic'/)
  expect(csp).toContain("frame-ancestors 'none'")
  expect(response.headers.get("X-Frame-Options")).toBe("DENY")
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
}

function expectNoStore(response: Response): void {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("Pragma")).toBe("no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie")
}

const forwardedCookie = (response: Response) => response.headers.get("x-middleware-request-cookie")

describe("security headers", () => {
  it("sets the AD-21 headers and forwards the nonce to the page", async () => {
    const response = await proxy(request("/auth", NAVIGATE))
    expectSecurityHeaders(response)
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy()
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("leaves a navigation without a session cookie alone", async () => {
    const response = await proxy(request("/", { ...NAVIGATE, cookie: "other=1" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Location")).toBeNull()
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })
})

describe("no-store pages and hand-off (AD-18, Stories 7.2, 7.3; F6-1)", () => {
  it.each(["/", "/?tab=insurance", "/account", "/account/", "/account?tab=provider", "/handoff", "/handoff/portal?to=create-org", "//handoff/portal"])(
    "%s answers the no-store set (navigation, RSC and prefetch alike)",
    async (path) => {
      for (const headers of [NAVIGATE, { rsc: "1" }, { "next-router-prefetch": "1" }, {}] as Record<string, string>[]) {
        const response = await proxy(request(path, headers))
        expectNoStore(response)
        expectSecurityHeaders(response)
      }
    },
  )

  it.each(["/auth", "/favicon.png", "/accounts", "/handoffx", "/api/session/ping"])("%s is left to its own caching", async (path) => {
    const response = await proxy(request(path, NAVIGATE))
    expect(response.headers.get("Cache-Control")).toBeNull()
  })

  it("the no-store set also rides the cleared-session 307 to /auth", async () => {
    const response = await proxy(request("/account", { ...NAVIGATE, cookie: `${SESSION_COOKIE}=garbage` }))
    expect(response.status).toBe(307)
    expectNoStore(response)
  })

  it("isNoStorePath matches only the pages and /handoff/**", () => {
    expect(isNoStorePath("/")).toBe(true)
    expect(isNoStorePath("/account//")).toBe(true)
    expect(isNoStorePath("/%68andoff/portal")).toBe(true)
    expect(isNoStorePath("/auth")).toBe(false)
    expect(isNoStorePath("/account/x")).toBe(false)
  })
})

describe("navigation activity (Story 1.6)", () => {
  it.each(["/", "/account"])("GET %s navigate with a valid cookie → re-sealed lastSeen = now, set and forwarded", async (path) => {
    const session = makeSession({ lastSeen: NOW - 5 * MIN, iat: NOW - 60 * MIN })
    const original = `${SESSION_COOKIE}=${await sealSession(session)}`
    const response = await proxy(request(`${path}?tab=x`, { ...NAVIGATE, cookie: `other=1; ${original}` }))
    expect(response.status).toBe(200)
    expectSecurityHeaders(response)
    const setCookie = response.headers.get("Set-Cookie") ?? ""
    expect(setCookie).toMatch(/; Path=\/; HttpOnly; Secure; SameSite=Lax$/)
    expect(await unsealSession(sealOf(setCookie))).toEqual({ ...session, lastSeen: NOW })
    expect(forwardedCookie(response)).toBe(`other=1; ${SESSION_COOKIE}=${sealOf(setCookie)}`)
  })

  it("rewrites only the session segment: other cookies are forwarded byte for byte", async () => {
    const original = await cookieFor()
    const raw = `pref=a%20b%3Bc%2C; ${original};theme=dark%7Cx; q="quoted%22"`
    const response = await proxy(request("/", { ...NAVIGATE, cookie: raw }))
    const renewed = sealOf(response.headers.get("Set-Cookie") ?? "")
    expect(forwardedCookie(response)).toBe(raw.replace(original, `${SESSION_COOKIE}=${renewed}`))
  })

  it("GET /account/ (trailing slash) navigate is the same page → renewed", async () => {
    const response = await proxy(request("/account/", { ...NAVIGATE, cookie: await cookieFor() }))
    expect(response.headers.get("Set-Cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=`))
  })

  it.each([
    ["55 s exactly", 55_000],
    ["already expired", -1],
  ])("token %s from expiry (race guard) → no re-seal, request passed through with the original cookie", async (_label, left) => {
    const cookie = await cookieFor({ accessExpiresAt: NOW + left })
    const response = await proxy(request("/", { ...NAVIGATE, cookie }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(forwardedCookie(response)).toBe(cookie)
  })

  it("idle 14:59 → still renewed", async () => {
    const response = await proxy(request("/", { ...NAVIGATE, cookie: await cookieFor({ lastSeen: NOW - (15 * MIN - 1_000) }) }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeTruthy()
  })

  it.each([
    ["idle 15:01 on /", "/", { lastSeen: NOW - (15 * MIN + 1_000) }],
    ["absolute 8 h + 1 s on /account", "/account", { iat: NOW - (8 * 60 * MIN + 1_000), lastSeen: NOW - MIN }],
  ])("%s → cookie cleared + 307 to /auth with security and no-store headers", async (_label, path, overrides) => {
    const response = await proxy(request(`${path}?tab=insurance`, { ...NAVIGATE, cookie: await cookieFor(overrides) }))
    expect(response.status).toBe(307)
    expect(response.headers.get("Location")).toBe("http://localhost:3000/auth")
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expectSecurityHeaders(response)
    expectNoStore(response)
  })

  it("an unsealable cookie → cleared + 307 to /auth", async () => {
    const response = await proxy(request("/", { ...NAVIGATE, cookie: `${SESSION_COOKIE}=Fe26.2*garbage` }))
    expect(response.status).toBe(307)
    expect(response.headers.get("Location")).toBe("http://localhost:3000/auth")
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
  })

  it.each([
    ["no Sec-Fetch-Mode", {}],
    ["an RSC fetch", { "sec-fetch-mode": "cors", rsc: "1" }],
    ["navigate + RSC header", { ...NAVIGATE, rsc: "1" }],
    ["navigate + Next-Router-Prefetch", { ...NAVIGATE, "next-router-prefetch": "1" }],
    ["navigate + Sec-Purpose: prefetch", { ...NAVIGATE, "sec-purpose": "prefetch" }],
    ["navigate + Purpose: prefetch", { ...NAVIGATE, purpose: "prefetch" }],
  ])("%s → not activity: no re-seal, no redirect, cookie forwarded unchanged", async (_label, headers) => {
    for (const cookie of [await cookieFor(), await cookieFor({ lastSeen: NOW - 20 * MIN })]) {
      const response = await proxy(request("/", { ...headers, cookie }))
      expect(response.status).toBe(200)
      expect(response.headers.get("Set-Cookie")).toBeNull()
      expect(forwardedCookie(response)).toBe(cookie)
    }
  })

  it.each([
    ["a navigate to another page", "/auth", "GET"],
    ["a navigate to a sub-path", "/account/x", "GET"],
    ["a POST to /", "/", "POST"],
    ["a HEAD to /", "/", "HEAD"],
    ["a HEAD to /account", "/account", "HEAD"],
  ])("%s is not activity", async (_label, path, method) => {
    const response = await proxy(request(path, { ...NAVIGATE, cookie: await cookieFor() }, method))
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("with misconfigured secrets the request is left to the page (headers still set)", async () => {
    const cookie = await cookieFor()
    vi.stubEnv("SESSION_SECRET", "")
    const { resetServerEnvCache } = await import("@/lib/server/env")
    resetServerEnvCache()
    const response = await proxy(request("/", { ...NAVIGATE, cookie }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expectSecurityHeaders(response)
  })
})

describe("kill switches (AD-20, Stories 1.16 and 7.2)", () => {
  const rewrittenTo = (response: Response) => response.headers.get("x-middleware-rewrite")
  const DISABLED = "http://localhost:3000/disabled"

  async function expectApi503(response: Response): Promise<void> {
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
    expect(response.headers.get("Retry-After")).toBe("300")
    expectSecurityHeaders(response)
    expectNoStore(response)
  }

  describe("PP_DISABLED=1", () => {
    beforeEach(() => stubServerEnv({ PP_DISABLED: "1" }))

    it.each(["/", "/auth", "/auth?lpl=abc", "/account", "/account/", "/handoff/portal?to=create-org"])(
      "rewrites the page %s to the 503 disabled screen, with security and no-store headers",
      async (path) => {
        const response = await proxy(request(path, NAVIGATE))
        expect(rewrittenTo(response)).toBe(DISABLED)
        expectSecurityHeaders(response)
        expectNoStore(response)
      },
    )

    it.each(["//api/pp/profile-picture-id", "/%61pi/1h/v2/user/myself", "/api//pp/mfa/validate/"])(
      "decides API vs page on the same normalized path the matcher uses: %s → 503 JSON",
      async (path) => {
        await expectApi503(await proxy(request(path)))
      },
    )

    it("/auth/ (trailing slash) is the /auth page for the referrer hint", async () => {
      const response = await proxy(request("/auth/", NAVIGATE))
      expect(response.headers.get("x-middleware-request-x-pp-disabled-from")).toBe("auth")
    })

    it("rewrites RSC and prefetch requests too", async () => {
      expect(rewrittenTo(await proxy(request("/", { rsc: "1" })))).toBe(DISABLED)
      expect(rewrittenTo(await proxy(request("/account", { "next-router-prefetch": "1", purpose: "prefetch" })))).toBe(DISABLED)
    })

    it("tells the screen when the page was /auth (its referrer may pick the link), and only then", async () => {
      const auth = await proxy(request("/auth", { ...NAVIGATE, referer: "https://1health.demo.1health.io/" }))
      expect(auth.headers.get("x-middleware-request-x-pp-disabled-from")).toBe("auth")
      const root = await proxy(request("/", { ...NAVIGATE, "x-pp-disabled-from": "auth" }))
      expect(root.headers.get("x-middleware-request-x-pp-disabled-from")).toBeNull()
    })

    it("does not re-seal the session of a switched-off page", async () => {
      const response = await proxy(request("/", { ...NAVIGATE, cookie: await cookieFor({ lastSeen: NOW - 5 * MIN }) }))
      expect(rewrittenTo(response)).toBe(DISABLED)
      expect(response.headers.get("Set-Cookie")).toBeNull()
    })

    it.each([
      ["GET", "/api/1h/v2/user/myself"],
      ["POST", "/api/pp/mfa/validate"],
      ["GET", "/api/pp/profile-picture-id"],
      ["POST", "/api/places/autocomplete"],
      ["POST", "/api/session/refresh"],
      ["POST", "/api/session/ping"],
    ])("%s %s → 503 SERVICE_DISABLED JSON", async (method, path) => {
      await expectApi503(await proxy(request(path, {}, method)))
    })

    it.each([
      ["POST", "/api/session/logout"],
      ["GET", "/api/session/logout"],
      ["POST", "/api/token"],
      ["GET", "/favicon.png"],
      ["GET", "/_next/static/chunk.js"],
    ])("leaves %s %s alone (logout always works; /api/token keeps its own envelope)", async (method, path) => {
      const response = await proxy(request(path, {}, method))
      expect(response.status).toBe(200)
      expect(rewrittenTo(response)).toBeNull()
      expectSecurityHeaders(response)
    })
  })

  describe("ACCOUNT_DISABLED=1", () => {
    beforeEach(() => stubServerEnv({ ACCOUNT_DISABLED: "1" }))

    it.each(["/account", "/account?tab=provider", "/handoff/portal"])("rewrites %s to the disabled screen", async (path) => {
      expect(rewrittenTo(await proxy(request(path, NAVIGATE)))).toBe(DISABLED)
    })

    it.each(["/api/pp/mfa/validate", "/api/pp/org-logo/12", "/api/pp/practice-support"])("%s → 503", async (path) => {
      await expectApi503(await proxy(request(path)))
    })

    it.each(["/", "/auth", "/api/1h/v2/user/myself", "/api/pp/profile-picture-id", "/api/places/details"])("keeps %s working", async (path) => {
      const response = await proxy(request(path, NAVIGATE))
      expect(response.status).toBe(200)
      expect(rewrittenTo(response)).toBeNull()
    })
  })

  it("with neither flag nothing is switched off", async () => {
    for (const path of ["/", "/account", "/api/pp/mfa/validate"]) expect(rewrittenTo(await proxy(request(path, NAVIGATE)))).toBeNull()
  })

  it("a misconfigured env switches nothing off here (routes fail on their own) and headers are still set", async () => {
    vi.stubEnv("SESSION_SECRET", "short")
    vi.stubEnv("PP_DISABLED", "1")
    resetServerEnvCache()
    const response = await proxy(request("/api/1h/v2/user/myself"))
    expect(response.status).toBe(200)
    expectSecurityHeaders(response)
  })
})
