// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TEST_SERVER_ENV } from "../../test/env-fixture"
import { createHmac } from "node:crypto"
import type { SessionData } from "./session"

/**
 * `POST /api/session/ping` (Story 1.6). The real `env.ts` and `session.ts` run;
 * only the `next/headers` cookie store is mocked, so the re-sealed `Set-Cookie`
 * can be unsealed and inspected. No upstream call is ever made.
 */

const SESSION_SECRET = "ping-session-secret-0123456789abcdef"
const SID = "sid-ping-123"
const ACCESS = "ping-access-token-AAAA"
const REFRESH = "ping-refresh-token-BBBB"
const CLEARED = "__Host-pp_s=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
const T = 1_800_000_000_000
const MIN = 60_000

const BASE_ENV = { ...TEST_SERVER_ENV, SESSION_SECRET }

function binding(sid = SID): string {
  return createHmac("sha256", SESSION_SECRET).update(sid).digest("base64url")
}

function sessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    accessToken: ACCESS,
    refreshToken: REFRESH,
    // The token's expiry is irrelevant to the ping: an expired one still pings.
    accessTokenExpiresAt: T - 1_000,
    userId: 42,
    personId: 7,
    environment: "demo",
    tenantId: 1,
    sid: SID,
    gen: 2,
    iat: T - 60 * MIN,
    lastSeen: T - 10 * MIN,
    refreshedAt: T - 30 * MIN,
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

beforeEach(() => {
  ORIGINAL_ENV = process.env
  ORIGINAL_FETCH = globalThis.fetch
  cookieValue = undefined
  cookiesThrow = false
  fetchMock = vi.fn()
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
  const { handlePing } = await import("./ping")
  const session = await import("./session")
  return { handlePing, session }
}

async function withSession(data: SessionData | null, env: Record<string, string> = {}) {
  const mods = await load(env)
  if (data) {
    const setCookie = await mods.session.sealSession(data)
    cookieValue = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
  }
  return mods
}

const GOOD_HEADERS = { "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding() }

function makeRequest(headers: Record<string, string> = GOOD_HEADERS) {
  return new Request("http://localhost:3000/api/session/ping", { method: "POST", headers })
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

function assertSingleRouteLog(status: number) {
  const lines = (infoSpy.mock.calls as unknown[][]).map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
  expect(lines).toHaveLength(1)
  expect(Object.keys(lines[0]).sort()).toEqual(["durationMs", "requestId", "routeTemplate", "status"])
  expect(lines[0]).toMatchObject({ routeTemplate: "/api/session/ping", status })
  const logs = allLogs()
  for (const secret of [ACCESS, REFRESH, SID, binding()]) expect(logs).not.toContain(secret)
}

async function code(res: Response): Promise<unknown> {
  return (JSON.parse(await res.text()) as { code?: unknown }).code
}

describe("route module", () => {
  it("exports only POST and dynamic = force-dynamic", async () => {
    await load()
    const mod = await import("@/app/api/session/ping/route")
    expect(Object.keys(mod).sort()).toEqual(["POST", "dynamic"])
    expect(mod.dynamic).toBe("force-dynamic")
  })
})

describe("handlePing — ok", () => {
  it("valid session + binding + same-origin → 204, lastSeen = now, echo, everything else unchanged", async () => {
    const before = sessionData()
    const { handlePing, session } = await withSession(before)
    const res = await handlePing(makeRequest())

    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    assertHeaders(res)
    expect(res.headers.get("x-pp-activity-at")).toBe(String(T))
    expect(fetchMock).not.toHaveBeenCalled()

    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("HttpOnly; Secure; SameSite=Lax; Path=/")
    const after = await session.unsealSession(setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";")))
    expect(after).toEqual({ ...before, lastSeen: T })
    assertSingleRouteLog(204)
  })

  it("idle 14:59 still pings", async () => {
    const { handlePing } = await withSession(sessionData({ lastSeen: T - (14 * MIN + 59_000) }))
    expect((await handlePing(makeRequest())).status).toBe(204)
  })
})

describe("handlePing — guards", () => {
  it("PP_DISABLED=1 → 503 SERVICE_DISABLED", async () => {
    const { handlePing } = await withSession(sessionData(), { PP_DISABLED: "1" })
    const res = await handlePing(makeRequest())
    expect(res.status).toBe(503)
    expect(await code(res)).toBe("SERVICE_DISABLED")
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(503)
  })

  it.each([
    ["cross-site", { "Sec-Fetch-Site": "cross-site", "X-PP-Session": binding() }],
    ["foreign Origin", { Origin: "https://evil.example", "X-PP-Session": binding() }],
    ["no Sec-Fetch-Site or Origin", { "X-PP-Session": binding() }],
    ["no X-PP-Session", { "Sec-Fetch-Site": "same-origin" }],
  ])("CSRF: %s → 403 CSRF", async (_label, headers) => {
    const { handlePing } = await withSession(sessionData())
    const res = await handlePing(makeRequest(headers))
    expect(res.status).toBe(403)
    expect(await code(res)).toBe("CSRF")
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(403)
  })

  it("no cookie → 401 SESSION_EXPIRED, no Set-Cookie", async () => {
    const { handlePing } = await withSession(null)
    const res = await handlePing(makeRequest())
    expect(res.status).toBe(401)
    expect(await code(res)).toBe("SESSION_EXPIRED")
    expect(res.headers.get("set-cookie")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(401)
  })

  it("unsealable cookie → 401 SESSION_EXPIRED + cookie cleared", async () => {
    const { handlePing } = await withSession(null)
    cookieValue = "Fe26.2*garbage"
    const res = await handlePing(makeRequest())
    expect(res.status).toBe(401)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
  })

  it.each([
    ["idle 15:01", { lastSeen: T - (15 * MIN + 1_000) }],
    ["absolute 8 h + 1 s (lastSeen 1 min ago)", { iat: T - (8 * 60 * MIN + 1_000), lastSeen: T - MIN }],
  ])("%s → 401 SESSION_EXPIRED + cookie cleared, no echo", async (_label, overrides) => {
    const { handlePing } = await withSession(sessionData(overrides))
    const res = await handlePing(makeRequest())
    expect(res.status).toBe(401)
    expect(await code(res)).toBe("SESSION_EXPIRED")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(res.headers.get("x-pp-activity-at")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(401)
  })

  it("wrong binding → 409 SESSION_CHANGED, cookie untouched", async () => {
    const { handlePing } = await withSession(sessionData())
    const res = await handlePing(makeRequest({ "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding("other") }))
    expect(res.status).toBe(409)
    expect(await code(res)).toBe("SESSION_CHANGED")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("x-pp-activity-at")).toBeNull()
    assertHeaders(res)
    assertSingleRouteLog(409)
  })

  it("a throw → 500 {} with headers, logged via logError", async () => {
    const { handlePing } = await withSession(sessionData())
    cookiesThrow = true
    const res = await handlePing(makeRequest())
    expect(res.status).toBe(500)
    expect(JSON.parse(await res.text())).toEqual({})
    assertHeaders(res)
    const line = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, unknown>
    expect(line).toEqual(expect.objectContaining({ routeTemplate: "/api/session/ping", status: 500, errorName: "TypeError" }))
    assertSingleRouteLog(500)
  })
})
