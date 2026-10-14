// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import type { SessionData } from "./session"

/**
 * `POST /api/session/logout` (Story 1.7). The real `env.ts` and `session.ts`
 * run; the `next/headers` cookie store and `next/server`'s `after` are mocked
 * (`after` collects its callbacks so each test runs them explicitly, proving the
 * revoke happens only after the response exists). Upstream `fetch` is a mock.
 */

const SESSION_SECRET = "logout-session-secret-0123456789abcdef"
const APP_ORIGIN = "https://app.example"
const API_ORIGIN = "https://demo.1health.io"
const SID = "sid-logout-123"
const ACCESS = "logout-access-token-AAAA"
const REFRESH = "logout-refresh-token-BBBB"
const CLEARED = "__Host-pp_s=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0"
const T = 1_800_000_000_000
const MIN = 60_000

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
  return {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    accessTokenExpiresAt: T + 10 * MIN,
    userId: 42,
    personId: 7,
    tenantId: 1,
    sid: SID,
    gen: 2,
    iat: T - 60 * MIN,
    lastSeen: T - MIN,
    ...overrides,
  }
}

let ORIGINAL_ENV: NodeJS.ProcessEnv
let ORIGINAL_FETCH: typeof globalThis.fetch
let fetchMock: ReturnType<typeof vi.fn>
let cookieValue: string | undefined
let cookiesThrow: boolean
let afterCallbacks: (() => unknown)[]
let infoSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  ORIGINAL_ENV = process.env
  ORIGINAL_FETCH = globalThis.fetch
  cookieValue = undefined
  cookiesThrow = false
  afterCallbacks = []
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(T)
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  globalThis.fetch = ORIGINAL_FETCH
  vi.resetModules()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

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
  vi.doMock("next/server", () => ({
    after: (cb: () => unknown) => {
      afterCallbacks.push(cb)
    },
  }))
  const logout = await import("./logout")
  const session = await import("./session")
  return { handleLogout: logout.handleLogout, REVOKE_PATH: logout.REVOKE_PATH, session }
}

async function withSession(data: SessionData | null, env: Record<string, string> = {}) {
  const mods = await load(env)
  if (data) {
    const setCookie = await mods.session.sealSession(data)
    cookieValue = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
  }
  return mods
}

/** Run the deferred `after()` callbacks, as Next does once the response is sent. */
async function runAfter() {
  const pending = afterCallbacks
  afterCallbacks = []
  for (const cb of pending) await cb()
}

const GOOD_HEADERS = { "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding() }

function makeRequest(headers: Record<string, string> = GOOD_HEADERS) {
  return new Request("http://localhost:3000/api/session/logout", { method: "POST", headers })
}

function assertHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
}

function allLogs(): string {
  return [infoSpy, errorSpy].flatMap((s) => (s.mock.calls as unknown[][]).map((c) => c.map(String).join(" "))).join("\n")
}

function assertNoSecretsLogged() {
  const logs = allLogs()
  for (const secret of [ACCESS, REFRESH, SID, binding(), "Bearer"]) expect(logs).not.toContain(secret)
}

function assertSingleRouteLog(status: number) {
  const lines = (infoSpy.mock.calls as unknown[][]).map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
  expect(lines).toHaveLength(1)
  expect(Object.keys(lines[0]).sort()).toEqual(["durationMs", "requestId", "routeTemplate", "status"])
  expect(lines[0]).toMatchObject({ routeTemplate: "/api/session/logout", status })
  assertNoSecretsLogged()
}

async function assertEmpty204(res: Response) {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe("")
  assertHeaders(res)
}

function assertRevokeCall() {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe(`${API_ORIGIN}/auth/user/logout`)
  expect(init.method).toBe("POST")
  expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${ACCESS}`)
  expect(init.cache).toBe("no-store")
  expect(init.redirect).toBe("manual")
  expect(init.signal).toBeInstanceOf(AbortSignal)
  expect(init.body).toBeUndefined()
}

describe("route module", () => {
  it("exports only POST and dynamic = force-dynamic", async () => {
    await load()
    const mod = await import("@/app/api/session/logout/route")
    expect(Object.keys(mod).sort()).toEqual(["POST", "dynamic"])
    expect(mod.dynamic).toBe("force-dynamic")
  })

  it("REVOKE_PATH is /auth/user/logout", async () => {
    const { REVOKE_PATH } = await load()
    expect(REVOKE_PATH).toBe("/auth/user/logout")
  })
})

describe("handleLogout — ok", () => {
  it("valid session + binding + same-origin → 204 + clear; revoke only after the response, with the Bearer token", async () => {
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest())

    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    // Nothing upstream until the deferred callback runs.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(1)

    await runAfter()
    assertRevokeCall()
    expect(errorSpy).not.toHaveBeenCalled()
    assertSingleRouteLog(204)
  })

  it.each([
    ["upstream 500", async () => new Response("boom", { status: 500 }), 500, "RevokeFailed"],
    ["upstream 302", async () => new Response(null, { status: 302, headers: { Location: "/x" } }), 302, "RevokeFailed"],
    [
      "network error",
      async () => {
        throw new TypeError("fetch failed")
      },
      0,
      "TypeError",
    ],
  ])("revoke %s → still 204 + clear; failure logged by name only", async (_label, impl, status, errorName) => {
    fetchMock.mockImplementation(impl)
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)

    await runAfter()
    assertRevokeCall()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, unknown>
    expect(Object.keys(line).sort()).toEqual(["errorName", "requestId", "routeTemplate", "status"])
    expect(line).toMatchObject({ routeTemplate: "/api/session/logout", status, errorName })
    assertSingleRouteLog(204)
  })

  it("revoke timeout → aborted at 5 s, still 204, AbortError logged", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(T)
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    )
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)

    const done = runAfter()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(errorSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    const line = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, unknown>
    expect(line).toMatchObject({ routeTemplate: "/api/session/logout", status: 0, errorName: "AbortError" })
    assertNoSecretsLogged()
  })
})

describe("handleLogout — no / bad cookie", () => {
  it("no cookie → 204 + clear, no revoke", async () => {
    const { handleLogout } = await withSession(null)
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    assertSingleRouteLog(204)
  })

  it("unsealable cookie → 204 + clear, no revoke", async () => {
    const { handleLogout } = await withSession(null)
    cookieValue = "Fe26.2*garbage"
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["idle 15:01", { lastSeen: T - (15 * MIN + 1_000) }],
    ["absolute 8 h + 1 s", { iat: T - (8 * 60 * MIN + 1_000) }],
  ])("aged (%s) with an unexpired token → 204 + clear, token still revoked", async (_label, overrides) => {
    const { handleLogout } = await withSession(sessionData(overrides))
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    await runAfter()
    assertRevokeCall()
  })

  it.each([
    ["expired a second ago", T - 1_000],
    ["expiring exactly now", T],
  ])("access token %s → 204 + clear, no revoke", async (_label, accessTokenExpiresAt) => {
    const { handleLogout } = await withSession(sessionData({ accessTokenExpiresAt }))
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("handleLogout — guards", () => {
  it("mismatched binding → 204, no Set-Cookie, no revoke", async () => {
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding("other") }))
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    assertSingleRouteLog(204)
  })

  it("mismatched binding on an aged session → 204, no Set-Cookie, no revoke", async () => {
    const { handleLogout } = await withSession(sessionData({ lastSeen: T - 20 * MIN }))
    const res = await handleLogout(makeRequest({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding("other") }))
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(afterCallbacks).toHaveLength(0)
  })

  it.each([
    ["cross-site", { "Sec-Fetch-Site": "cross-site", "X-PP-Session": binding() }],
    ["foreign Origin", { Origin: "https://evil.example", "X-PP-Session": binding() }],
    ["no Sec-Fetch-Site or Origin", { "X-PP-Session": binding() }],
    ["no X-PP-Session", { "Sec-Fetch-Site": "same-origin" }],
  ])("CSRF: %s → 403 CSRF, cookie untouched, no revoke", async (_label, headers) => {
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest(headers))
    expect(res.status).toBe(403)
    expect(JSON.parse(await res.text())).toEqual({ code: "CSRF" })
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    assertSingleRouteLog(403)
  })

  it("PP_DISABLED=1 → 204 + clear, no upstream call", async () => {
    const { handleLogout } = await withSession(sessionData(), { PP_DISABLED: "1" })
    const res = await handleLogout(makeRequest())
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("no revoke endpoint (REVOKE_PATH null) → 204 + clear, no upstream call", async () => {
    const { handleLogout } = await withSession(sessionData())
    const res = await handleLogout(makeRequest(), null)
    await assertEmpty204(res)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(afterCallbacks).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a throw → 500 {} with headers, logged via logError", async () => {
    const { handleLogout } = await withSession(sessionData())
    cookiesThrow = true
    const res = await handleLogout(makeRequest())
    expect(res.status).toBe(500)
    expect(JSON.parse(await res.text())).toEqual({})
    assertHeaders(res)
    const line = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, unknown>
    expect(line).toEqual(expect.objectContaining({ routeTemplate: "/api/session/logout", status: 500, errorName: "TypeError" }))
    assertSingleRouteLog(500)
  })
})
