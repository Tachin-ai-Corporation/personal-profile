// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import type { SessionData } from "./session"

/**
 * `POST /api/session/refresh` (AD-16) with `fetch` mocked. The real `env.ts`
 * loads from `process.env` (APP_ENV=demo → API_ORIGIN=demo.1health.io) and the
 * real `session.ts` seals/unseals; only `next/headers` cookies are mocked, so the
 * re-sealed `Set-Cookie` can be unsealed and inspected.
 */

const SESSION_SECRET = "refresh-session-secret-0123456789abcdef"
const API_ORIGIN = "https://demo.1health.io"
const APP_ORIGIN = "https://app.example"
const IDP_URL = `${API_ORIGIN}/auth/oauth2/token`
const SID = "sid-refresh-123"

const OLD_ACCESS = "old-access-token-AAAA"
const OLD_REFRESH = "old-refresh-token-BBBB"
const NEW_ACCESS = "new-access-token-CCCC"
const NEW_REFRESH = "new-refresh-token-DDDD"
const TOKENS = [OLD_ACCESS, OLD_REFRESH, NEW_ACCESS, NEW_REFRESH]

const BASE_ENV = {
  APP_ENV: "demo",
  APP_ORIGIN,
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
  SESSION_SECRET,
}

function binding(sid = SID): string {
  return createHmac("sha256", SESSION_SECRET).update(sid).digest("base64url")
}

function sessionData(overrides: Partial<SessionData> = {}): SessionData {
  const now = Date.now()
  return {
    accessToken: OLD_ACCESS,
    refreshToken: OLD_REFRESH,
    accessTokenExpiresAt: now - 1_000,
    userId: 42,
    personId: 7,
    tenantId: 1,
    sid: SID,
    gen: 3,
    iat: now - 60_000,
    lastSeen: now - 30_000,
    ...overrides,
  }
}

let ORIGINAL_ENV: NodeJS.ProcessEnv
let ORIGINAL_FETCH: typeof globalThis.fetch
let fetchMock: ReturnType<typeof vi.fn>
let cookieValue: string | undefined
let cookiesThrow: boolean
let infoSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>
let debugSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  ORIGINAL_ENV = process.env
  ORIGINAL_FETCH = globalThis.fetch
  cookieValue = undefined
  cookiesThrow = false
  fetchMock = vi.fn(async () => idpOk())
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  globalThis.fetch = ORIGINAL_FETCH
  vi.resetModules()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function idpOk(body: Record<string, unknown> = { access_token: NEW_ACCESS, refresh_token: NEW_REFRESH, expires_in: 3600 }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

async function load(env: Record<string, string> = {}) {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV, ...env }
  vi.doMock("next/headers", () => ({
    cookies: async () => {
      if (cookiesThrow) throw new TypeError("cookie store failed")
      return {
        get: (name: string) => (name === "__Host-pp_s" && cookieValue !== undefined ? { value: cookieValue } : undefined),
      }
    },
  }))
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  const { handleRefresh } = await import("./refresh")
  const session = await import("./session")
  return { handleRefresh, session }
}

/** Load the modules and install a sealed cookie for `data`. */
async function withSession(data: SessionData | null, env: Record<string, string> = {}) {
  const mods = await load(env)
  if (data) {
    const setCookie = await mods.session.sealSession(data)
    cookieValue = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
  }
  return mods
}

const GOOD_HEADERS = { "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding() }

function makeRequest(headers: Record<string, string> = GOOD_HEADERS, query = "") {
  return new Request(`http://localhost:3000/api/session/refresh${query}`, { method: "POST", headers })
}

async function readBody(res: Response): Promise<{ text: string; json: Record<string, unknown> }> {
  const text = await res.text()
  return { text, json: JSON.parse(text) as Record<string, unknown> }
}

function assertHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
}

function assertNoTokenLeak(text: string) {
  for (const token of TOKENS) expect(text).not.toContain(token)
}

/** Every console line written during the test, joined. */
function allLogs(): string {
  return [infoSpy, errorSpy, debugSpy].flatMap((s) => (s.mock.calls as unknown[][]).map((c) => c.map(String).join(" "))).join("\n")
}

function assertSingleRouteLog(status: number) {
  const lines = (infoSpy.mock.calls as unknown[][]).map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
  expect(lines).toHaveLength(1)
  expect(Object.keys(lines[0]).sort()).toEqual(["durationMs", "requestId", "routeTemplate", "status"])
  expect(lines[0]).toMatchObject({ routeTemplate: "/api/session/refresh", status })
  assertNoTokenLeak(allLogs())
}

async function unsealSetCookie(session: typeof import("./session"), res: Response): Promise<SessionData | null> {
  const setCookie = res.headers.get("set-cookie") ?? ""
  const value = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
  return session.unsealSession(value)
}

describe("route module", () => {
  it("exports only POST and dynamic = force-dynamic", async () => {
    await load()
    const mod = await import("@/app/api/session/refresh/route")
    expect(Object.keys(mod).sort()).toEqual(["POST", "dynamic"])
    expect(mod.dynamic).toBe("force-dynamic")
  })
})

describe("handleRefresh — still valid", () => {
  it("token valid beyond 30 s → 200 {}, no IdP call, no Set-Cookie", async () => {
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 120_000 }))
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(200)
    expect((await readBody(res)).json).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(200)
  })
})

describe("handleRefresh — refresh ok", () => {
  it("expired token → one form-encoded no-store IdP call; re-sealed cookie with gen+1 and same sid", async () => {
    const before = sessionData()
    const { handleRefresh, session } = await withSession(before)
    const startedAt = Date.now()
    const res = await handleRefresh(makeRequest())

    expect(res.status).toBe(200)
    const body = await readBody(res)
    expect(body.json).toEqual({})
    assertNoTokenLeak(body.text)
    assertHeaders(res)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(IDP_URL)
    expect(init.method).toBe("POST")
    const headers = new Headers(init.headers)
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded")
    expect(headers.get("accept")).toBe("application/json")
    expect(init.cache).toBe("no-store")
    expect(init.redirect).toBe("manual")
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const form = new URLSearchParams(String(init.body))
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "refresh_token",
      refresh_token: OLD_REFRESH,
      client_id: "public-client",
    })

    const after = await unsealSetCookie(session, res)
    expect(after).not.toBeNull()
    expect(after).toMatchObject({
      accessToken: NEW_ACCESS,
      refreshToken: NEW_REFRESH,
      sid: before.sid,
      gen: before.gen + 1,
      userId: before.userId,
      personId: before.personId,
      tenantId: before.tenantId,
      iat: before.iat,
      lastSeen: before.lastSeen,
    })
    expect(after!.accessTokenExpiresAt).toBeGreaterThanOrEqual(startedAt + 3_600_000)
    expect(after!.accessTokenExpiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000)
    expect(after!.refreshedAt).toBeGreaterThanOrEqual(startedAt)
    expect(after!.refreshedAt).toBeLessThanOrEqual(Date.now())
    expect(after!.accessTokenExpiresAt - after!.refreshedAt!).toBe(3_600_000)
    expect(res.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=None; Partitioned; Path=/")
    assertSingleRouteLog(200)
  })

  it("token within the 30 s skew is refreshed", async () => {
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 10_000 }))
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it("token exactly 30 s from expiry, not forced → IdP called (valid only when > 30 s)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(1_800_000_000_000)
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 30_000 }))
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it("IdP 200 without refresh_token keeps the old refresh token", async () => {
    fetchMock.mockImplementation(async () => idpOk({ access_token: NEW_ACCESS, expires_in: 3600 }))
    const { handleRefresh, session } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(200)
    const after = await unsealSetCookie(session, res)
    expect(after).toMatchObject({ accessToken: NEW_ACCESS, refreshToken: OLD_REFRESH })
  })

  it("numeric-string expires_in (\"3600\") is honoured", async () => {
    fetchMock.mockImplementation(async () => idpOk({ access_token: NEW_ACCESS, expires_in: "3600" }))
    const { handleRefresh, session } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest())
    const after = await unsealSetCookie(session, res)
    expect(after!.accessTokenExpiresAt - after!.refreshedAt!).toBe(3_600_000)
  })

  it.each([
    ["missing", { access_token: NEW_ACCESS }],
    ["zero", { access_token: NEW_ACCESS, expires_in: 0 }],
    ["negative", { access_token: NEW_ACCESS, expires_in: -5 }],
    ["non-numeric string", { access_token: NEW_ACCESS, expires_in: "soon" }],
  ])("expires_in %s → expiry falls back to now + 300 s", async (_label, body) => {
    fetchMock.mockImplementation(async () => idpOk(body))
    const { handleRefresh, session } = await withSession(sessionData())
    const startedAt = Date.now()
    const res = await handleRefresh(makeRequest())
    const after = await unsealSetCookie(session, res)
    expect(after!.accessTokenExpiresAt).toBeGreaterThanOrEqual(startedAt + 300_000)
    expect(after!.accessTokenExpiresAt).toBeLessThanOrEqual(Date.now() + 300_000)
  })
})

describe("handleRefresh — forced (?force=1)", () => {
  it.each([
    ["refreshedAt absent", undefined],
    ["refreshedAt 10 s ago", -10_000],
    ["refreshedAt 60 s ago", -60_000],
  ])("valid token, %s → IdP called once; re-sealed cookie with gen+1 and a new refreshedAt", async (_l, offset) => {
    const now = Date.now()
    const before = sessionData({
      accessTokenExpiresAt: now + 600_000,
      ...(offset === undefined ? {} : { refreshedAt: now + offset }),
    })
    const { handleRefresh, session } = await withSession(before)
    const startedAt = Date.now()
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))

    expect(res.status).toBe(200)
    const body = await readBody(res)
    expect(body.json).toEqual({})
    assertNoTokenLeak(body.text)
    assertHeaders(res)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(IDP_URL)
    const after = await unsealSetCookie(session, res)
    expect(after).toMatchObject({ accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH, sid: SID, gen: before.gen + 1 })
    expect(after!.refreshedAt).toBeGreaterThanOrEqual(startedAt)
    assertSingleRouteLog(200)
  })

  it("expired token, forced → IdP called once", async () => {
    const { handleRefresh } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it.each([
    ["valid token", 600_000],
    ["expired token", -1_000],
  ])("forced within the 10 s guard (%s) → 200 {}, no IdP call, no Set-Cookie", async (_l, expiresIn) => {
    const now = Date.now()
    const { handleRefresh } = await withSession(
      sessionData({ accessTokenExpiresAt: now + expiresIn, refreshedAt: now - 5_000 }),
    )
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))
    expect(res.status).toBe(200)
    expect((await readBody(res)).json).toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(200)
  })

  it.each([
    ["force=0", "?force=0"],
    ["force=true", "?force=true"],
    ["force=", "?force="],
    ["force=1&force=1", "?force=1&force=1"],
    ["FORCE=1", "?FORCE=1"],
    ["other param", "?x=1"],
  ])("%s is not forced → valid token answers 200 with no IdP call", async (_l, query) => {
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 600_000 }))
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, query))
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("force=1 alongside another param is still forced", async () => {
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 600_000 }))
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, "?x=2&force=1"))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("forcing never skips the earlier guards", async () => {
    const valid = sessionData({ accessTokenExpiresAt: Date.now() + 600_000 })

    let mods = await withSession(valid, { PP_DISABLED: "1" })
    expect((await mods.handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))).status).toBe(503)

    mods = await withSession(valid)
    expect((await mods.handleRefresh(makeRequest({ "Sec-Fetch-Site": "cross-site", "X-PP-Session": binding() }, "?force=1"))).status).toBe(403)
    expect((await mods.handleRefresh(makeRequest({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding("x") }, "?force=1"))).status).toBe(409)

    cookieValue = undefined
    expect((await mods.handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forced IdP rejection → cookie cleared, 401 SESSION_EXPIRED", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }))
    const { handleRefresh } = await withSession(sessionData({ accessTokenExpiresAt: Date.now() + 600_000 }))
    const res = await handleRefresh(makeRequest(GOOD_HEADERS, "?force=1"))
    expect(res.status).toBe(401)
    expect((await readBody(res)).json).toEqual({ code: "SESSION_EXPIRED" })
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})

describe("handleRefresh — IdP rejects", () => {
  it.each([
    ["401", () => new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 })],
    ["400 invalid_grant", () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })],
  ])("IdP %s → cookie cleared, 401 SESSION_EXPIRED", async (_label, make) => {
    fetchMock.mockImplementation(async () => make())
    const { handleRefresh } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(401)
    expect((await readBody(res)).json).toEqual({ code: "SESSION_EXPIRED" })
    expect(res.headers.get("set-cookie")).toBe("__Host-pp_s=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0")
    expect(fetchMock).toHaveBeenCalledOnce()
    assertHeaders(res)
    assertSingleRouteLog(401)
  })
})

describe("handleRefresh — IdP unavailable", () => {
  it.each([
    ["network error", async () => {
      throw new TypeError("fetch failed")
    }],
    ["500", async () => new Response("boom", { status: 500 })],
    ["503", async () => new Response(null, { status: 503 })],
    ["302", async () => new Response(null, { status: 302, headers: { Location: "https://evil.example" } })],
    ["403", async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })],
    ["400 other error", async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 })],
    ["400 non-JSON", async () => new Response("nope", { status: 400 })],
    ["2xx without access_token", async () => idpOk({ refresh_token: NEW_REFRESH, expires_in: 3600 })],
    ["2xx non-string access_token", async () => idpOk({ access_token: 123 })],
    ["2xx non-JSON", async () => new Response("<html>", { status: 200 })],
  ])("%s → cookie unchanged, 503 REFRESH_UNAVAILABLE", async (_label, impl) => {
    fetchMock.mockImplementation(impl)
    const { handleRefresh } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(503)
    const body = await readBody(res)
    expect(body.json).toEqual({ code: "REFRESH_UNAVAILABLE" })
    assertNoTokenLeak(body.text)
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    assertHeaders(res)
    assertSingleRouteLog(503)
  })

  it("timeout (25 s) → 503 REFRESH_UNAVAILABLE", async () => {
    const { handleRefresh } = await withSession(sessionData())
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    )
    const pending = handleRefresh(makeRequest())
    for (let i = 0; i < 50 && fetchMock.mock.calls.length === 0; i++) await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(24_999)
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const res = await pending
    expect(res.status).toBe(503)
    expect((await readBody(res)).json).toEqual({ code: "REFRESH_UNAVAILABLE" })
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

describe("handleRefresh — guards (no IdP call)", () => {
  it("PP_DISABLED=1 → 503 SERVICE_DISABLED", async () => {
    const { handleRefresh } = await withSession(sessionData(), { PP_DISABLED: "1" })
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(503)
    expect((await readBody(res)).json).toEqual({ code: "SERVICE_DISABLED" })
    expect(fetchMock).not.toHaveBeenCalled()
    assertHeaders(res)
    assertSingleRouteLog(503)
  })

  it.each([
    ["cross-site", { "Sec-Fetch-Site": "cross-site", "X-PP-Session": binding() }],
    ["foreign Origin", { Origin: "https://evil.example", "X-PP-Session": binding() }],
    ["no Sec-Fetch-Site or Origin", { "X-PP-Session": binding() }],
    ["no X-PP-Session", { "Sec-Fetch-Site": "same-origin" }],
  ])("CSRF: %s → 403 CSRF", async (_label, headers) => {
    const { handleRefresh } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest(headers))
    expect(res.status).toBe(403)
    expect((await readBody(res)).json).toEqual({ code: "CSRF" })
    expect(fetchMock).not.toHaveBeenCalled()
    assertHeaders(res)
    assertSingleRouteLog(403)
  })

  it("no cookie → 401 SESSION_EXPIRED (cookie untouched)", async () => {
    const { handleRefresh } = await withSession(null)
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(401)
    expect((await readBody(res)).json).toEqual({ code: "SESSION_EXPIRED" })
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    assertHeaders(res)
  })

  it("unsealable cookie → 401 SESSION_EXPIRED", async () => {
    const { handleRefresh } = await withSession(null)
    cookieValue = "Fe26.2*garbage"
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(401)
    expect((await readBody(res)).json).toEqual({ code: "SESSION_EXPIRED" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("X-PP-Session ≠ HMAC(sid) → 409 SESSION_CHANGED", async () => {
    const { handleRefresh } = await withSession(sessionData())
    const res = await handleRefresh(makeRequest({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding("other-sid") }))
    expect(res.status).toBe(409)
    expect((await readBody(res)).json).toEqual({ code: "SESSION_CHANGED" })
    expect(fetchMock).not.toHaveBeenCalled()
    assertHeaders(res)
    assertSingleRouteLog(409)
  })
})

describe("handleRefresh — unhandled error", () => {
  it("a throw → 500 {} with headers, logged via logError", async () => {
    const { handleRefresh } = await withSession(sessionData())
    cookiesThrow = true
    const res = await handleRefresh(makeRequest())
    expect(res.status).toBe(500)
    expect((await readBody(res)).json).toEqual({})
    assertHeaders(res)
    expect(errorSpy).toHaveBeenCalledOnce()
    const line = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, unknown>
    expect(line).toEqual(expect.objectContaining({ routeTemplate: "/api/session/refresh", status: 500, errorName: "TypeError" }))
    assertSingleRouteLog(500)
  })
})
