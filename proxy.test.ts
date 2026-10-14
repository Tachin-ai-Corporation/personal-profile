import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SESSION_COOKIE, sealSession, unsealSession } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { stubServerEnv } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { proxy } from "./proxy"

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
