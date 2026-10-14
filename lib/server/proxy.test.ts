// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import type { NextRequest } from "next/server"
import type { AllowlistEntry } from "./proxy-allowlist"

/**
 * Full-pipeline coverage for `createProxy` over an INJECTED fixture allowlist, with
 * `fetch` mocked (MSW never sees these server-side upstream calls). The real
 * `env.ts` loads from `process.env` (APP_ENV=demo → API_ORIGIN=demo.1health.io);
 * `session.ts` is partially mocked so `getSession` / `hasSessionCookie` are
 * controllable (the real `sealSession` etc. stay); `realSession: true` uses the
 * real module over a mocked `next/headers` cookie store instead.
 */

const SESSION_SECRET = "proxy-session-secret-0123456789abcdef"
const API_ORIGIN = "https://demo.1health.io" // ORIGIN_BY_ENV["demo"]
const APP_ORIGIN = "https://app.example"
const SID = "sid-proxy-123"
const PERSON_ID = 7
const USER_ID = 42

const BASE_ENV = {
  APP_ENV: "demo",
  APP_ORIGIN,
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
  SESSION_SECRET,
}

/** The injected fixture allowlist exercising every entry shape the spec names. */
const FIXTURES: AllowlistEntry[] = [
  { method: "GET", template: "/v2/user/myself", query: {}, body: "none" },
  { method: "GET", template: "/v2/person/{personId}/ssn/expose", query: {}, body: "none" },
  { method: "PUT", template: "/v2/person/location/{id}", query: {}, body: "json" },
  { method: "DELETE", template: "/v2/person/location/{id}", query: {}, body: "none" },
  { method: "GET", template: "/v2/things", query: { page: { kind: "client", pattern: /^\d+$/ } }, body: "none" },
  { method: "PUT", template: "/v2/file/{id}", query: { isPublic: { kind: "server", value: "false" } }, body: "json" },
  { method: "GET", template: "/v2/image/{id}", query: {}, body: "none", asImage: true },
]

function binding(sid = SID): string {
  return createHmac("sha256", SESSION_SECRET).update(sid).digest("base64url")
}

type Session = {
  sid: string
  personId: number
  userId: number
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: number
  tenantId: number
  gen: number
  iat: number
  lastSeen: number
}

function freshSession(overrides: Partial<Session> = {}): Session {
  const now = Date.now()
  return {
    sid: SID,
    personId: PERSON_ID,
    userId: USER_ID,
    accessToken: "access-token-xyz",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: now + 600_000,
    tenantId: 1,
    gen: 0,
    iat: now,
    lastSeen: now,
    ...overrides,
  }
}

let ORIGINAL_ENV: NodeJS.ProcessEnv
let ORIGINAL_FETCH: typeof globalThis.fetch
let fetchMock: ReturnType<typeof vi.fn>
/** The sealed `__Host-pp_s` value the mocked cookie store returns (real-session cases). */
let cookieValue: string | undefined

beforeEach(() => {
  cookieValue = undefined
  ORIGINAL_ENV = process.env
  ORIGINAL_FETCH = globalThis.fetch
  fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  globalThis.fetch = ORIGINAL_FETCH
  vi.resetModules()
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function loadProxy(
  opts: {
    env?: Record<string, string>
    getSession?: ReturnType<typeof vi.fn>
    hasSessionCookie?: ReturnType<typeof vi.fn>
    realSession?: boolean
  } = {},
) {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV, ...(opts.env ?? {}) }
  vi.doMock("next/headers", () => ({
    cookies: async () => ({
      get: (name: string) => (name === "__Host-pp_s" && cookieValue !== undefined ? { value: cookieValue } : undefined),
    }),
  }))
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  const getSession = opts.getSession ?? vi.fn(async () => freshSession())
  const hasSessionCookie = opts.hasSessionCookie ?? vi.fn(async () => true)
  if (opts.realSession) {
    vi.doUnmock("@/lib/server/session")
  } else {
    vi.doMock("@/lib/server/session", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./session")>()),
      getSession,
      hasSessionCookie,
    }))
  }
  const { createProxy } = await import("./proxy")
  const session = await import("@/lib/server/session")
  return { proxy: createProxy(FIXTURES), getSession, hasSessionCookie, session }
}

function makeRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): NextRequest {
  return new Request(`http://localhost:3000/api/1h/${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
  }) as unknown as NextRequest
}

/** Headers for a valid GET on a non-image entry. */
function getHeaders() {
  return { "X-PP-Session": binding(), "Sec-Fetch-Site": "same-origin" }
}

/** Headers for a valid non-GET (CSRF + binding + JSON). */
function putHeaders() {
  return {
    "Content-Type": "application/json",
    "Sec-Fetch-Site": "same-origin",
    "X-PP-Session": binding(),
  }
}

async function bodyCode(res: Response): Promise<string | undefined> {
  try {
    return (JSON.parse(await res.text()) as { code?: string }).code
  } catch {
    return undefined
  }
}

function assertNoStoreAndNosniff(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  expect(res.headers.get("x-request-id")).toBeTruthy()
}

// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("GET /v2/user/myself → 200, streamed body, filtered + no-store headers", async () => {
    const upstreamBody = JSON.stringify({ id: USER_ID, personId: PERSON_ID })
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "upstream=1",
          "Access-Control-Allow-Origin": "*",
          ETag: '"abc"',
          "Cache-Control": "public, max-age=99",
          "Last-Modified": "now",
        },
      }),
    )
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(upstreamBody)
    expect(res.headers.get("content-type")).toBe("application/json")
    assertNoStoreAndNosniff(res)
    // Dropped upstream headers.
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
    expect(res.headers.get("etag")).toBeNull()
    expect(res.headers.get("last-modified")).toBeNull()

    // AD-2 forward contract.
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, fetchInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API_ORIGIN}/api/v2/user/myself`)
    expect(fetchInit.cache).toBe("no-store")
    expect(fetchInit.redirect).toBe("manual")
    expect(fetchInit.signal).toBeInstanceOf(AbortSignal)
    const fwd = fetchInit.headers as Headers
    expect(fwd.get("authorization")).toBe("Bearer access-token-xyz")
    expect(fwd.get("x-request-id")).toBeTruthy()
    expect(fwd.get("cookie")).toBeNull()
    expect(fwd.get("x-pp-session")).toBeNull()
  })

  it("does not forward a stale upstream Content-Length (gzip auto-decompress guard)", async () => {
    // Node fetch auto-decompresses gzip but leaves the compressed Content-Length;
    // forwarding it would truncate the decompressed body. We drop it and stream.
    const fullBody = JSON.stringify({ id: USER_ID, note: "a".repeat(80) })
    fetchMock.mockResolvedValueOnce(
      new Response(fullBody, {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Length": "5" },
      }),
    )
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-length")).toBeNull()
    expect(await res.text()).toBe(fullBody)
  })
})

describe("kill switch & guards with no upstream", () => {
  it("PP_DISABLED=1 → 503 SERVICE_DISABLED", async () => {
    const { proxy } = await loadProxy({ env: { PP_DISABLED: "1" } })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(503)
    expect(await bodyCode(res)).toBe("SERVICE_DISABLED")
    expect(fetchMock).not.toHaveBeenCalled()
    assertNoStoreAndNosniff(res)
  })

  it("not allowlisted → 403 NOT_ALLOWED", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/nope/here", { headers: getHeaders() }))
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("NOT_ALLOWED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["auth/x", "auth"],
    ["v2/admin/thing", "admin"],
    ["v2/graphql", "graphql"],
    ["v2/public/external-application/auth", "public external-application"],
  ])("denied prefix %s → 403 NOT_ALLOWED", async (path) => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest(path, { headers: getHeaders() }))
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("NOT_ALLOWED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("wrong method (POST to a GET-only template) → 405", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.POST(makeRequest("v2/user/myself", { method: "POST", headers: putHeaders(), body: "{}" }))
    expect(res.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(["HEAD", "OPTIONS", "TRACE"] as const)("%s → 405 (explicit handler)", async (method) => {
    const { proxy } = await loadProxy()
    const res = await proxy[method](makeRequest("v2/user/myself"))
    expect(res.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
    assertNoStoreAndNosniff(res)
  })

  it("HEAD under PP_DISABLED=1 → 503 SERVICE_DISABLED (kill switch precedence)", async () => {
    const { proxy } = await loadProxy({ env: { PP_DISABLED: "1" } })
    const res = await proxy.HEAD(makeRequest("v2/user/myself"))
    expect(res.status).toBe(503)
    expect(await bodyCode(res)).toBe("SERVICE_DISABLED")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("request-body forwarding is gated on the entry body mode", () => {
  it("a json non-GET entry streams the request body with duplex:\"half\"", async () => {
    const { proxy } = await loadProxy()
    await proxy.PUT(makeRequest("v2/person/location/5", { method: "PUT", headers: putHeaders(), body: "{}" }))
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string }
    expect(init.body).toBeTruthy()
    expect(init.duplex).toBe("half")
  })

  it("a body:\"none\" non-GET entry does not forward a client body", async () => {
    const { proxy } = await loadProxy()
    await proxy.DELETE(
      makeRequest("v2/person/location/5", {
        method: "DELETE",
        headers: { "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding() },
        body: "should-be-ignored",
      }),
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    const init = fetchMock.mock.calls[0][1] as RequestInit & { duplex?: string }
    expect(init.body == null).toBe(true)
    expect(init.duplex).toBeUndefined()
  })
})

describe("method override is never honored", () => {
  it("X-HTTP-Method-Override: GET on a POST stays POST (→ 405 on a GET-only template)", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.POST(
      makeRequest("v2/user/myself", {
        method: "POST",
        headers: { ...putHeaders(), "X-HTTP-Method-Override": "GET" },
        body: "{}",
      }),
    )
    expect(res.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("?_method=GET is treated as an unknown query param → 400 BAD_QUERY", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself?_method=GET", { headers: getHeaders() }))
    expect(res.status).toBe(400)
    expect(await bodyCode(res)).toBe("BAD_QUERY")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("path normalization table", () => {
  it.each([
    ["..%2Fuser", 400, "BAD_PATH"],
    ["%2e%2e/user", 400, "BAD_PATH"],
    ["%252F/user", 400, "BAD_PATH"],
    ["v2//user", 400, "BAD_PATH"],
    [";x/user", 400, "BAD_PATH"],
    ["v2/user/myself/", 400, "BAD_PATH"],
    ["V2/User/Myself", 403, "NOT_ALLOWED"], // normalizes fine; fails the exact-literal match
  ])("%s → %i %s, no upstream", async (path, status, code) => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest(path, { headers: getHeaders() }))
    expect(res.status).toBe(status)
    expect(await bodyCode(res)).toBe(code)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("owner-id substitution", () => {
  it("owner `me` substitutes the session id into the upstream URL", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/person/me/ssn/expose", { headers: getHeaders() }))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${API_ORIGIN}/api/v2/person/${PERSON_ID}/ssn/expose`)
  })

  it("owner spoof (own numeric id, not `me`) → 403 NOT_ALLOWED, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest(`v2/person/${USER_ID}/ssn/expose`, { headers: getHeaders() }))
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("NOT_ALLOWED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("bad non-owner id segment → 403 NOT_ALLOWED, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(makeRequest("v2/person/location/abc", { method: "PUT", headers: putHeaders(), body: "{}" }))
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("NOT_ALLOWED")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("query allowlist", () => {
  it("unknown param → 400 BAD_QUERY", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/things?bogus=1", { headers: getHeaders() }))
    expect(res.status).toBe(400)
    expect(await bodyCode(res)).toBe("BAD_QUERY")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("allowlisted param failing its regex → 400 BAD_QUERY", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/things?page=abc", { headers: getHeaders() }))
    expect(res.status).toBe(400)
    expect(await bodyCode(res)).toBe("BAD_QUERY")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("allowlisted param passing its regex is forwarded", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/things?page=3", { headers: getHeaders() }))
    expect(res.status).toBe(200)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${API_ORIGIN}/api/v2/things?page=3`)
  })

  it("server-fixed param overrides any client value", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(
      makeRequest("v2/file/9?isPublic=true", { method: "PUT", headers: putHeaders(), body: "{}" }),
    )
    expect(res.status).toBe(200)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${API_ORIGIN}/api/v2/file/9?isPublic=false`)
  })
})

describe("session & token", () => {
  it("no session → 401 SESSION_EXPIRED, no upstream", async () => {
    const { proxy } = await loadProxy({ getSession: vi.fn(async () => null) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("SESSION_EXPIRED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("token within 30 s of expiry → 401 TOKEN_EXPIRED, no refresh, no upstream", async () => {
    const getSession = vi.fn(async () => freshSession({ accessTokenExpiresAt: Date.now() + 10_000 }))
    const { proxy } = await loadProxy({ getSession })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("TOKEN_EXPIRED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("token exactly 30 s from expiry → 401 TOKEN_EXPIRED (agrees with the refresh route)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(1_800_000_000_000)
      const getSession = vi.fn(async () => freshSession({ accessTokenExpiresAt: Date.now() + 30_000 }))
      const { proxy } = await loadProxy({ getSession })
      const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
      expect(res.status).toBe(401)
      expect(await bodyCode(res)).toBe("TOKEN_EXPIRED")
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("upstream 401 → 401 TOKEN_EXPIRED", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 401 }))
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("TOKEN_EXPIRED")
  })
})

describe("CSRF & session binding", () => {
  it("non-GET without Sec-Fetch-Site/Origin → 403 CSRF, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(
      makeRequest("v2/person/location/5", { method: "PUT", headers: { "Content-Type": "application/json", "X-PP-Session": binding() }, body: "{}" }),
    )
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("CSRF")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("non-GET without X-PP-Session → 403 CSRF, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(
      makeRequest("v2/person/location/5", { method: "PUT", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: "{}" }),
    )
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("CSRF")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("JSON entry with a non-JSON Content-Type → 415 UNSUPPORTED_MEDIA", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(
      makeRequest("v2/person/location/5", { method: "PUT", headers: { "Content-Type": "text/plain", "Sec-Fetch-Site": "same-origin", "X-PP-Session": binding() }, body: "x" }),
    )
    expect(res.status).toBe(415)
    expect(await bodyCode(res)).toBe("UNSUPPORTED_MEDIA")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("mismatched X-PP-Session → 409 SESSION_CHANGED, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: { "X-PP-Session": binding("different-sid"), "Sec-Fetch-Site": "same-origin" } }))
    expect(res.status).toBe(409)
    expect(await bodyCode(res)).toBe("SESSION_CHANGED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("GET without X-PP-Session on a non-image entry → 403 CSRF, no upstream", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself"))
    expect(res.status).toBe(403)
    expect(await bodyCode(res)).toBe("CSRF")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("GET without X-PP-Session on an asImage entry → allowed (proceeds)", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/image/5"))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${API_ORIGIN}/api/v2/image/5`)
  })
})

describe("upstream outcome mapping", () => {
  it("upstream 3xx → 502 UPSTREAM_REDIRECT", async () => {
    fetchMock.mockResolvedValueOnce(new Response("go", { status: 302, headers: { Location: "/x" } }))
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(502)
    expect(await bodyCode(res)).toBe("UPSTREAM_REDIRECT")
  })

  it("opaqueredirect (the real redirect:\"manual\" shape) → 502 UPSTREAM_REDIRECT", async () => {
    fetchMock.mockResolvedValueOnce({
      type: "opaqueredirect",
      status: 0,
      headers: new Headers(),
      body: null,
    } as unknown as Response)
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(502)
    expect(await bodyCode(res)).toBe("UPSTREAM_REDIRECT")
  })

  it("upstream 5xx → 502 UPSTREAM_ERROR, never the upstream body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("INTERNAL UPSTREAM DETAIL", { status: 503 }))
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain("INTERNAL UPSTREAM DETAIL")
    expect(JSON.parse(text).code).toBe("UPSTREAM_ERROR")
  })

  it("network error → 502 UPSTREAM_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(502)
    expect(await bodyCode(res)).toBe("UPSTREAM_ERROR")
  })

  it("4xx (≠401) passes through with its status and body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: "SOME_ERROR" }), { status: 422, headers: { "Content-Type": "application/json" } }))
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(422)
    expect(JSON.parse(await res.text()).errorCode).toBe("SOME_ERROR")
    assertNoStoreAndNosniff(res)
  })

  it("timeout → 504 UPSTREAM_TIMEOUT", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    )
    const { proxy } = await loadProxy()
    const resPromise = proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    await vi.advanceTimersByTimeAsync(25_000)
    const res = await resPromise
    expect(res.status).toBe(504)
    expect(await bodyCode(res)).toBe("UPSTREAM_TIMEOUT")
  })
})

describe("logging", () => {
  it("a proxied owner call logs the template, not the substituted id", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    const { proxy } = await loadProxy()
    await proxy.GET(makeRequest("v2/person/me/ssn/expose", { headers: getHeaders() }))

    const line = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("ssn/expose"))
    expect(line).toBeTruthy()
    const logged = JSON.parse(line as string)
    expect(logged.template).toBe("/v2/person/{personId}/ssn/expose")
    expect(logged.status).toBe(200)
    expect(line).not.toContain(`/person/${PERSON_ID}/`)
    spy.mockRestore()
  })

  it("an internal throw → 500, logs {requestId, routeTemplate, status, errorName}, no upstream", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const getSession = vi.fn(async () => {
      throw new TypeError("boom")
    })
    const { proxy } = await loadProxy({ getSession })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
    const logged = JSON.parse(String(errSpy.mock.calls[0][0]))
    expect(logged).toMatchObject({ status: 500, errorName: "TypeError", routeTemplate: "-" })
    expect(logged.requestId).toBeTruthy()
    errSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Story 1.6 — idle logoff, activity re-seal
// ---------------------------------------------------------------------------

const CLEARED = "__Host-pp_s=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0"
const T0 = 1_800_000_000_000
const MIN = 60_000

type SessionModule = typeof import("./session")

async function unsealSetCookie(session: SessionModule, res: Response) {
  const setCookie = res.headers.get("set-cookie") ?? ""
  return session.unsealSession(setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";")))
}

function activityHeaders(extra: Record<string, string> = {}) {
  return { ...getHeaders(), "X-PP-Activity": "user", ...extra }
}

describe("activity re-seal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(T0)
  })

  it("GET with X-PP-Activity: user, verified binding, token > 55 s → re-seal lastSeen = now + echo; header not forwarded", async () => {
    const before = freshSession({ lastSeen: T0 - 5 * MIN, iat: T0 - 60 * MIN })
    const { proxy, session } = await loadProxy({ getSession: vi.fn(async () => before) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const fwd = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Headers
    expect(fwd.get("x-pp-activity")).toBeNull()

    expect(res.headers.get("x-pp-activity-at")).toBe(String(T0))
    expect(res.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=None; Partitioned; Path=/")
    expect(await unsealSetCookie(session, res)).toEqual({ ...before, lastSeen: T0 })
    assertNoStoreAndNosniff(res)
  })

  it("a non-GET with X-PP-Activity: user re-seals too", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.PUT(
      makeRequest("v2/person/location/5", {
        method: "PUT",
        headers: { ...putHeaders(), "X-PP-Activity": "user" },
        body: "{}",
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("x-pp-activity-at")).toBe(String(T0))
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it.each([
    ["404", () => new Response(JSON.stringify({ code: "NOPE" }), { status: 404 })],
    ["500", () => new Response("boom", { status: 500 })],
  ])("re-seals whatever the upstream status (%s)", async (_label, make) => {
    fetchMock.mockImplementationOnce(async () => make())
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    expect(res.headers.get("x-pp-activity-at")).toBe(String(T0))
    expect(res.headers.get("set-cookie")).toBeTruthy()
  })

  it.each([
    ["31 s", 31_000],
    ["40 s", 40_000],
    ["exactly 55 s", 55_000],
  ])("token %s from expiry → forwarded, no Set-Cookie, no echo (race guard)", async (_label, left) => {
    const { proxy } = await loadProxy({ getSession: vi.fn(async () => freshSession({ accessTokenExpiresAt: T0 + left })) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("x-pp-activity-at")).toBeNull()
  })

  it("token 55.001 s from expiry → re-sealed", async () => {
    const { proxy } = await loadProxy({ getSession: vi.fn(async () => freshSession({ accessTokenExpiresAt: T0 + 55_001 })) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    expect(res.headers.get("x-pp-activity-at")).toBe(String(T0))
  })

  it("asImage GET without X-PP-Session but with X-PP-Activity → served, no re-seal", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/image/5", { headers: { "X-PP-Activity": "user" } }))
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("x-pp-activity-at")).toBeNull()
  })

  it.each([
    ["no X-PP-Activity", getHeaders()],
    ["X-PP-Activity: background", { ...getHeaders(), "X-PP-Activity": "background" }],
  ])("%s → no re-seal", async (_label, headers) => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers }))
    expect(res.status).toBe(200)
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("x-pp-activity-at")).toBeNull()
  })

  it("rejected before forwarding (binding mismatch) → no re-seal", async () => {
    const { proxy } = await loadProxy()
    const res = await proxy.GET(
      makeRequest("v2/user/myself", { headers: { "X-PP-Session": binding("other"), "X-PP-Activity": "user" } }),
    )
    expect(res.status).toBe(409)
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

describe("session expiry clears the cookie", () => {
  it("no session but a cookie was sent → 401 SESSION_EXPIRED + clear", async () => {
    const { proxy } = await loadProxy({ getSession: vi.fn(async () => null), hasSessionCookie: vi.fn(async () => true) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("SESSION_EXPIRED")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    assertNoStoreAndNosniff(res)
  })

  it("no session and no cookie → 401 without Set-Cookie", async () => {
    const { proxy } = await loadProxy({ getSession: vi.fn(async () => null), hasSessionCookie: vi.fn(async () => false) })
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

describe("idle / absolute limits through the real session (Story 1.6)", () => {
  async function sealInto(session: SessionModule, data: Partial<Session>) {
    const setCookie = await session.sealSession(freshSession({ accessTokenExpiresAt: T0 + 9 * 60 * MIN, ...data }))
    cookieValue = setCookie.slice("__Host-pp_s=".length, setCookie.indexOf(";"))
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(T0)
  })

  it("idle 14:59 → valid", async () => {
    const { proxy, session } = await loadProxy({ realSession: true })
    await sealInto(session, { iat: T0, lastSeen: T0 })
    vi.setSystemTime(T0 + 14 * MIN + 59_000)
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(200)
  })

  it("idle 15:01 → 401 SESSION_EXPIRED + cookie cleared, no upstream", async () => {
    const { proxy, session } = await loadProxy({ realSession: true })
    await sealInto(session, { iat: T0, lastSeen: T0 })
    vi.setSystemTime(T0 + 15 * MIN + 1_000)
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("SESSION_EXPIRED")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("absolute 8 h + 1 s with lastSeen 1 min ago → 401 + cookie cleared", async () => {
    const { proxy, session } = await loadProxy({ realSession: true })
    const now = T0 + 8 * 60 * MIN + 1_000
    await sealInto(session, { iat: T0, lastSeen: now - MIN, accessTokenExpiresAt: now + 30 * MIN })
    vi.setSystemTime(now)
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    expect(res.status).toBe(401)
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
  })

  it("background only: GETs without X-PP-Activity never move lastSeen; at 15:01 the session expires", async () => {
    const { proxy, session } = await loadProxy({ realSession: true })
    await sealInto(session, { iat: T0, lastSeen: T0 })
    for (const at of [5 * MIN, 10 * MIN, 15 * MIN]) {
      vi.setSystemTime(T0 + at)
      const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
      expect(res.status).toBe(200)
      expect(res.headers.get("set-cookie")).toBeNull()
    }
    vi.setSystemTime(T0 + 15 * MIN + 1_000)
    const res = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(res.status).toBe(401)
    expect(await bodyCode(res)).toBe("SESSION_EXPIRED")
    expect(res.headers.get("set-cookie")).toBe(CLEARED)
  })

  it("a user-initiated call re-seals, so the idle window restarts from it", async () => {
    const { proxy, session } = await loadProxy({ realSession: true })
    await sealInto(session, { iat: T0, lastSeen: T0 })
    vi.setSystemTime(T0 + 10 * MIN)
    const active = await proxy.GET(makeRequest("v2/user/myself", { headers: activityHeaders() }))
    const renewed = active.headers.get("set-cookie") ?? ""
    expect(renewed).toBeTruthy()
    cookieValue = renewed.slice("__Host-pp_s=".length, renewed.indexOf(";"))
    vi.setSystemTime(T0 + 20 * MIN)
    const later = await proxy.GET(makeRequest("v2/user/myself", { headers: getHeaders() }))
    expect(later.status).toBe(200)
  })
})
