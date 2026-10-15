import { gzipSync } from "node:zlib"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { setLogSink } from "@/lib/server/log"
import { SESSION_COOKIE, sealSession, unsealSession } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { IMAGES, imageOfSize } from "@/test/image-fixture"
import { multipart, multipartInit, type Part, type Transfer } from "@/test/multipart-fixture"
import { DEMO, PROD } from "@/test/upstream-fixture"
import { ALLOWLIST } from "./allowlist"
import { createProxyHandler } from "./handler"
import type { AllowlistEntry } from "./types"

const UP = DEMO.apiBase
const FIXTURES: AllowlistEntry[] = [
  ...ALLOWLIST,
  { method: "GET", template: "v2/person/{personId}/ssn/expose" },
  { method: "POST", template: "v2/mfa/enable/totp", profile: true },
  { method: "POST", template: "v2/mfa/disable/totp", profile: true },
  { method: "DELETE", template: "v2/fixture/{id}", fixedQuery: { hardDelete: "true" } },
  { method: "POST", template: "v2/small", body: z.object({ a: z.string() }), maxBytes: 20 },
  { method: "GET", template: "v2/mfa/enable/{userId}" },
  { method: "POST", template: "v2/fixture/png-only", upload: { part: "file", types: ["png"] }, maxBytes: 2048 },
]

const env = testEnv
const proxy = createProxyHandler({ allowlist: FIXTURES, env: env(), now: () => NOW })

interface Call {
  method?: string
  path: string
  session?: SessionPayload | null
  headers?: Record<string, string>
  body?: string
}

async function call({ method = "GET", path, session = makeSession(), headers = {}, body }: Call, handler = proxy) {
  const h: Record<string, string> = { ...headers }
  if (session) h.cookie = `${SESSION_COOKIE}=${await sealSession(session)}`
  return handler(new Request(`http://localhost:3000/api/1h/${path}`, { method, headers: h, body }))
}

async function expectError(response: Response, status: number, errorCode: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("Pragma")).toBe("no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie")
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
}

beforeEach(() => stubServerEnv())

let upstreamCalls: () => number

describe("proxy: rejections before upstream", () => {
  beforeEach(() => {
    upstreamCalls = trackAllRequests()
  })
  afterEach(() => expect(upstreamCalls()).toBe(0))

  it("checks the deny list before the allowlist: an allowlisted but denied template is 403", async () => {
    const handler = createProxyHandler({
      allowlist: [{ method: "GET", template: "v2/tenant/sys-config" }],
      env: env(),
      now: () => NOW,
    })
    await expectError(await call({ path: "v2/tenant/sys-config" }, handler), 403, "NOT_ALLOWED")
  })

  it.each([
    ["..%2F", "v2/..%2Fuser/myself", 400, "BAD_PATH"],
    ["%252F", "v2/user%252Fmyself", 400, "BAD_PATH"],
    [";x", "v2/user/myself;x", 400, "BAD_PATH"],
    ["trailing /", "v2/user/myself/", 400, "BAD_PATH"],
    ["mixed case", "V2/User/Myself", 403, "NOT_ALLOWED"],
    ["not allowlisted", "v2/user/npi", 403, "NOT_ALLOWED"],
    ["denied", "v2/tenant/sys-config", 403, "NOT_ALLOWED"],
    ["owner id instead of me", "v2/person/4242/ssn/expose", 403, "NOT_ALLOWED"],
    ["unknown query param", "v2/user/myself?x=1", 400, "BAD_QUERY"],
    ["_method", "v2/user/myself?_method=DELETE", 400, "BAD_QUERY"],
    ["constructor", "v2/user/myself?constructor=x", 400, "BAD_QUERY"],
    ["__proto__", "v2/user/contact-point/list?__proto__=x", 400, "BAD_QUERY"],
    ["toString", "v2/user/contact-point/list?toString=x", 400, "BAD_QUERY"],
    ["bad type", "v2/user/contact-point/list?type=Fax", 400, "BAD_QUERY"],
    ["a file download query", "v2/file/123/download?x=1", 400, "BAD_QUERY"],
    ["a non-numeric file id", "v2/file/abc/download", 403, "NOT_ALLOWED"],
  ])("GET %s → %i %s", async (_label, path, status, errorCode) => {
    await expectError(await call({ path }), status, errorCode)
  })

  it.each([
    ["POST", "v2/mfa/enable", 403, "NOT_ALLOWED"],
    ["POST", "v2/mfa/enable/123", 403, "NOT_ALLOWED"],
    ["GET", "v2/mfa/validate/123", 403, "NOT_ALLOWED"],
    ["POST", "v2/user/switch-tenant/5", 403, "NOT_ALLOWED"],
    ["PUT", "v2/user/update-password", 403, "NOT_ALLOWED"],
    ["POST", "v2/user/myself", 405, "METHOD_NOT_ALLOWED"],
    ["HEAD", "v2/user/myself", 405, "METHOD_NOT_ALLOWED"],
    ["OPTIONS", "v2/user/myself", 405, "METHOD_NOT_ALLOWED"],
  ])("%s %s → %i %s", async (method, path, status, errorCode) => {
    const response = await call({ method, path })
    expect(response.status).toBe(status)
    if (method !== "HEAD") expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  })

  it("rejects a path outside the proxy prefix", async () => {
    const response = await proxy(new Request("http://localhost:3000/api/other"))
    await expectError(response, 400, "BAD_PATH")
  })

  it("answers 401 SESSION_EXPIRED without a session, clearing nothing when no cookie was sent", async () => {
    const response = await call({ path: "v2/user/myself", session: null })
    await expectError(response, 401, "SESSION_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it.each([
    ["idle 15:01", { lastSeen: NOW - (15 * 60_000 + 1_000) }],
    ["absolute 8 h + 1 s with recent activity", { iat: NOW - (8 * 3600_000 + 1_000), lastSeen: NOW - 60_000 }],
  ])("an aged session (%s) → 401 SESSION_EXPIRED + cookie cleared", async (_label, overrides) => {
    const response = await call({ path: "v2/user/myself", session: makeSession(overrides), headers: { "X-PP-Activity": "user" } })
    await expectError(response, 401, "SESSION_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  })

  it("an unsealable cookie → 401 SESSION_EXPIRED + cookie cleared", async () => {
    const response = await proxy(new Request("http://localhost:3000/api/1h/v2/user/myself", { headers: { cookie: `${SESSION_COOKIE}=garbage` } }))
    await expectError(response, 401, "SESSION_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0$/)
  })

  it("has no CSRF or session-binding check (D5): a cross-site non-GET without X-PP-Session reaches validation", async () => {
    const response = await call({
      method: "PUT",
      path: "v2/user/edit",
      headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.test", "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "en-US" }),
    })
    await expectError(response, 400, "BAD_BODY")
  })

  it("answers 415 for a non-JSON body on a JSON entry", async () => {
    const response = await call({ method: "PUT", path: "v2/user/edit", headers: { "Content-Type": "text/plain" }, body: "{}" })
    await expectError(response, 415, "UNSUPPORTED_MEDIA")
  })

  it.each([
    ["invalid JSON", "{nope"],
    ["locale field", JSON.stringify({ locale: "en-US" })],
    ["username field", JSON.stringify({ username: "ann" })],
    ["a name over 24 characters", JSON.stringify({ firstName: "x".repeat(25) })],
    ["a race outside the enum", JSON.stringify({ race: "Martian" })],
    ["phoneNumberRegion without phoneNumber", JSON.stringify({ phoneNumberRegion: "us" })],
  ])("answers 400 BAD_BODY for %s", async (_label, body) => {
    const response = await call({ method: "PUT", path: "v2/user/edit", headers: { "Content-Type": "application/json" }, body })
    await expectError(response, 400, "BAD_BODY")
  })

  it("answers 400 BAD_BODY for a body on an entry without one", async () => {
    const response = await call({ method: "POST", path: "v2/mfa/enable/totp", body: "x" })
    await expectError(response, 400, "BAD_BODY")
  })

  it("answers 413 TOO_LARGE by Content-Length and by actual size", async () => {
    const headers = { "Content-Type": "application/json" }
    const big = JSON.stringify({ a: "x".repeat(40) })
    await expectError(await call({ method: "POST", path: "v2/small", headers: { ...headers, "Content-Length": "999" }, body: big }), 413, "TOO_LARGE")
    await expectError(await call({ method: "POST", path: "v2/small", headers, body: big }), 413, "TOO_LARGE")
  })

  it("answers 401 TOKEN_EXPIRED within 30 s of expiry, writing no cookie", async () => {
    const response = await call({ path: "v2/user/myself", session: makeSession({ accessExpiresAt: NOW + 29_000 }) })
    await expectError(response, 401, "TOKEN_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("answers 503 SERVICE_DISABLED for everything with PP_DISABLED=1", async () => {
    const handler = createProxyHandler({ allowlist: FIXTURES, env: env({ PP_DISABLED: "1" }), now: () => NOW })
    await expectError(await call({ path: "v2/user/myself" }, handler), 503, "SERVICE_DISABLED")
  })
})

describe("proxy: ACCOUNT_DISABLED", () => {
  const handler = createProxyHandler({ allowlist: FIXTURES, env: env({ ACCOUNT_DISABLED: "1" }), now: () => NOW })

  it("disables Profile entries before any upstream call", async () => {
    const calls = trackAllRequests()
    await expectError(await call({ method: "POST", path: "v2/mfa/enable/totp" }, handler), 503, "SERVICE_DISABLED")
    expect(calls()).toBe(0)
  })

  it("keeps other entries working", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    expect((await call({ path: "v2/user/myself" }, handler)).status).toBe(200)
  })
})

describe("proxy: forwarding", () => {
  it("forwards GET myself with Bearer, request id and only allowlisted headers; drops upstream cookies and caching", async () => {
    let seen: Headers | undefined
    server.use(
      http.get(`${UP}/v2/user/myself`, ({ request }) => {
        seen = request.headers
        return HttpResponse.json(
          { id: 42 },
          {
            headers: {
              "Set-Cookie": "up=1",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=600",
              ETag: "abc",
              "X-Request-Id": "up-1",
            },
          },
        )
      }),
    )
    const session = makeSession()
    const response = await call({ path: "v2/user/myself", session, headers: { "Accept-Language": "en", "X-HTTP-Method-Override": "DELETE", "X-Other": "1" } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 42 })
    expect(seen?.get("Authorization")).toBe(`Bearer ${session.accessToken}`)
    expect(seen?.get("X-Request-Id")).toMatch(/[0-9a-f-]{36}/)
    expect(seen?.get("Accept-Language")).toBe("en")
    expect(seen?.get("X-HTTP-Method-Override")).toBeNull()
    expect(seen?.get("X-Other")).toBeNull()
    expect(seen?.get("Cookie")).toBeNull()
    expect(seen?.get("X-PP-Session")).toBeNull()
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(response.headers.get("ETag")).toBeNull()
    expect(response.headers.get("X-Request-Id")).toBe("up-1")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("uses the session's environment for the upstream origin", async () => {
    server.use(http.get(`${PROD.apiBase}/v2/user/myself`, () => HttpResponse.json({ env: "prod" })))
    const response = await call({ path: "v2/user/myself", session: makeSession({ environment: "prod" }) })
    expect(await response.json()).toEqual({ env: "prod" })
  })

  it("substitutes me with the session personId and logs only the template", async () => {
    let upstreamPath = ""
    server.use(
      http.get(`${UP}/v2/person/:id/ssn/expose`, ({ request }) => {
        upstreamPath = new URL(request.url).pathname
        return HttpResponse.json({})
      }),
    )
    const lines: string[] = []
    const push = (l: string) => void lines.push(l)
    const restore = setLogSink({ info: push, warn: push, error: push })
    await call({ path: "v2/person/me/ssn/expose", session: makeSession({ personId: 98765 }) })
    restore()
    expect(upstreamPath).toBe("/api/v2/person/98765/ssn/expose")
    const line = lines.find((l) => l.includes('"kind":"request"')) ?? ""
    expect(JSON.parse(line)).toMatchObject({ method: "GET", routeTemplate: "/v2/person/{personId}/ssn/expose", status: 200 })
    expect(line).not.toContain("98765")
  })

  it("rebuilds the query, forces server-fixed params and passes repeatable types", async () => {
    let search = ""
    server.use(
      http.get(`${UP}/v2/user/contact-point/list`, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json([])
      }),
      http.delete(`${UP}/v2/fixture/:id`, ({ request }) => {
        search = new URL(request.url).search
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await call({ path: "v2/user/contact-point/list?type=Email&type=Landline" })
    expect(search).toBe("?type=Email&type=Landline")
    const deleted = await call({ method: "DELETE", path: "v2/fixture/12?hardDelete=false" })
    expect(deleted.status).toBe(204)
    expect(search).toBe("?hardDelete=true")
  })

  it("forces preview=true on an image GET", async () => {
    let search = ""
    server.use(
      http.get(`${UP}/v2/file/:id/download`, ({ request }) => {
        search = new URL(request.url).search
        return new HttpResponse(new Uint8Array([137, 80]), { headers: { "Content-Type": "image/png" } })
      }),
    )
    const response = await call({ path: "v2/file/5/download?preview=false" })
    expect(response.status).toBe(200)
    expect(search).toBe("?preview=true")
  })

  it("forwards the validated JSON body of PUT user/edit", async () => {
    let received: unknown
    server.use(
      http.put(`${UP}/v2/user/edit`, async ({ request }) => {
        received = await request.json()
        return HttpResponse.json({ ok: 1 })
      }),
    )
    const response = await call({
      method: "PUT",
      path: "v2/user/edit",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ firstName: "Ann", phoneNumber: "+14155552125", phoneNumberRegion: "us", email: "ann@example.com" }),
    })
    expect(response.status).toBe(200)
    expect(received).toEqual({ firstName: "Ann", phoneNumber: "+14155552125", phoneNumberRegion: "us", email: "ann@example.com" })
  })

  it("forwards a body-less POST", async () => {
    server.use(http.post(`${UP}/v2/mfa/disable/totp`, () => HttpResponse.json(true)))
    expect((await call({ method: "POST", path: "v2/mfa/disable/totp" })).status).toBe(200)
  })

  it("never logs request or response bodies, even in development (D6)", async () => {
    server.use(http.put(`${UP}/v2/user/edit`, () => HttpResponse.json({ ssn: "987-65-4321" })))
    const lines: string[] = []
    const push = (l: string) => void lines.push(l)
    const restore = setLogSink({ info: push, warn: push, error: push })
    const dev = createProxyHandler({ allowlist: FIXTURES, env: env({ NODE_ENV: "development" }), now: () => NOW })
    const response = await call({ method: "PUT", path: "v2/user/edit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ socialSecurityNumber: "123-45-6789" }) }, dev)
    await response.text()
    restore()
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain("123-45-6789")
    expect(lines[0]).not.toContain("987-65-4321")
  })

  it.each([
    ["upstream 4xx passes through", () => HttpResponse.json({ message: "Nope", code: 1234 }, { status: 409 }), 409, { message: "Nope", code: 1234 }],
    ["upstream 401 → TOKEN_EXPIRED", () => new HttpResponse("x", { status: 401 }), 401, { errorCode: "TOKEN_EXPIRED", source: "proxy" }],
    ["upstream 3xx → UPSTREAM_REDIRECT", () => new HttpResponse(null, { status: 302, headers: { Location: "https://x.test" } }), 502, { errorCode: "UPSTREAM_REDIRECT", source: "proxy" }],
    ["upstream 5xx → UPSTREAM_ERROR, no body", () => HttpResponse.json({ secret: "stack" }, { status: 500 }), 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
    ["network error → UPSTREAM_ERROR", () => HttpResponse.error(), 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
  ])("%s", async (_label, resolver, status, body) => {
    server.use(http.get(`${UP}/v2/user/myself`, resolver))
    const response = await call({ path: "v2/user/myself" })
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })

  it("never forwards Content-Length (a gzip-encoded upstream is decompressed by fetch)", async () => {
    const json = JSON.stringify({ items: "x".repeat(5000) })
    const compressed = gzipSync(json)
    server.use(
      http.get(`${UP}/v2/user/myself`, () =>
        new HttpResponse(compressed, {
          headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Content-Length": String(compressed.length) },
        }),
      ),
    )
    const response = await call({ path: "v2/user/myself" })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Length")).toBeNull()
    expect(response.headers.get("Content-Encoding")).toBeNull()
  })

  it("uses the shipped allowlist, env and clock by default", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 1 })))
    const at = Date.now()
    const response = await call({ path: "v2/user/myself", session: makeSession({ iat: at, lastSeen: at, accessExpiresAt: at + 600_000 }) }, createProxyHandler())
    expect(response.status).toBe(200)
  })
})

describe("proxy: user activity (Story 1.6)", () => {
  const MIN = 60_000
  const ACTIVITY = { "X-PP-Activity": "user" }

  function setCookieSession(response: Response): Promise<SessionPayload | null> {
    const header = response.headers.get("Set-Cookie") ?? ""
    return unsealSession(header.slice(SESSION_COOKIE.length + 1, header.indexOf(";")))
  }

  it("a flagged GET re-seals lastSeen = now, echoes X-PP-Activity-At, and never forwards the flag upstream", async () => {
    let seen: Headers | undefined
    server.use(
      http.get(`${UP}/v2/user/myself`, ({ request }) => {
        seen = request.headers
        return HttpResponse.json({ id: 42 })
      }),
    )
    const session = makeSession({ lastSeen: NOW - 10 * MIN })
    const response = await call({ path: "v2/user/myself", session, headers: ACTIVITY })
    expect(response.status).toBe(200)
    expect(seen?.get("X-PP-Activity")).toBeNull()
    expect(response.headers.get("X-PP-Activity-At")).toBe(String(NOW))
    expect(await setCookieSession(response)).toEqual({ ...session, lastSeen: NOW })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })

  it("a flagged PUT re-seals too, and so does an upstream error answer (the user still acted)", async () => {
    server.use(http.put(`${UP}/v2/user/edit`, () => HttpResponse.json({ message: "Nope" }, { status: 409 })))
    const response = await call({
      method: "PUT",
      path: "v2/user/edit",
      headers: { ...ACTIVITY, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ann" }),
    })
    expect(response.status).toBe(409)
    expect(response.headers.get("X-PP-Activity-At")).toBe(String(NOW))
  })

  it("a flagged request whose upstream answers 5xx still re-seals (502 UPSTREAM_ERROR + X-PP-Activity-At)", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => new HttpResponse("boom", { status: 500 })))
    const session = makeSession({ lastSeen: NOW - 10 * MIN })
    const response = await call({ path: "v2/user/myself", session, headers: ACTIVITY })
    await expectError(response, 502, "UPSTREAM_ERROR")
    expect(response.headers.get("X-PP-Activity-At")).toBe(String(NOW))
    expect(await setCookieSession(response)).toEqual({ ...session, lastSeen: NOW })
  })

  it.each([
    ["no flag (background revalidation)", {}],
    ["a flag other than user", { "X-PP-Activity": "yes" }],
  ])("%s → forwarded, no re-seal, no echo", async (_label, headers) => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    const response = await call({ path: "v2/user/myself", headers })
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("X-PP-Activity-At")).toBeNull()
  })

  it.each([
    ["31 s", 31_000],
    ["55 s exactly", 55_000],
  ])("token %s from expiry (race guard: ≤ skew + upstream timeout) → forwarded, no re-seal", async (_label, left) => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    const response = await call({ path: "v2/user/myself", session: makeSession({ accessExpiresAt: NOW + left }), headers: ACTIVITY })
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("X-PP-Activity-At")).toBeNull()
  })

  it("token 56 s from expiry → re-sealed", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    const response = await call({ path: "v2/user/myself", session: makeSession({ accessExpiresAt: NOW + 56_000 }), headers: ACTIVITY })
    expect(response.headers.get("X-PP-Activity-At")).toBe(String(NOW))
  })

  it("an upstream 401 (TOKEN_EXPIRED) is not re-sealed: the client refreshes and replays", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => new HttpResponse(null, { status: 401 })))
    const response = await call({ path: "v2/user/myself", headers: ACTIVITY })
    await expectError(response, 401, "TOKEN_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("a re-seal that fails (cookie over budget) leaves the upstream answer untouched", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    const response = await call({ path: "v2/user/myself", session: makeSession({ refreshToken: "r".repeat(4000) }), headers: ACTIVITY })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 42 })
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("15 min of background GETs alone never move lastSeen: at 15:01 the session is expired", async () => {
    server.use(http.get(`${UP}/v2/user/myself`, () => HttpResponse.json({ id: 42 })))
    const session = makeSession({ lastSeen: NOW, iat: NOW })
    const cookie = `${SESSION_COOKIE}=${await sealSession(session)}`
    // A revalidation every 2 min up to exactly 15:00 (each one allowed, none re-seals).
    for (const minute of [1, 3, 5, 7, 9, 11, 13, 15]) {
      const at = NOW + minute * MIN
      const handler = createProxyHandler({ allowlist: FIXTURES, env: env(), now: () => at })
      const response = await handler(new Request("http://localhost:3000/api/1h/v2/user/myself", { headers: { cookie } }))
      expect(response.status).toBe(200)
      expect(response.headers.get("Set-Cookie")).toBeNull()
      await response.text()
    }
    const late = createProxyHandler({ allowlist: FIXTURES, env: env(), now: () => NOW + 15 * MIN + 1_000 })
    const response = await late(new Request("http://localhost:3000/api/1h/v2/user/myself", { headers: { cookie } }))
    await expectError(response, 401, "SESSION_EXPIRED")
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0$/)
  })
})

describe("proxy: deny list re-checked after owner substitution", () => {
  it("an allowlisted owner template whose substituted path is denied → 403 before upstream", async () => {
    const calls = trackAllRequests()
    await expectError(await call({ path: "v2/mfa/enable/me" }), 403, "NOT_ALLOWED")
    expect(calls()).toBe(0)
  })
})

describe("proxy: capped body reads", () => {
  it("a NaN Content-Length → 400 BAD_BODY before reading", async () => {
    const calls = trackAllRequests()
    const response = await call({ method: "PUT", path: "v2/user/edit", headers: { "Content-Type": "application/json", "Content-Length": "abc" }, body: "{}" })
    await expectError(response, 400, "BAD_BODY")
    expect(calls()).toBe(0)
  })
})

describe("proxy: image downloads (AD-13 hardening)", () => {
  const image = (bytes: Uint8Array<ArrayBuffer>, declared: string) =>
    http.get(`${UP}/v2/file/:id/download`, () =>
      new HttpResponse(bytes, {
        headers: {
          "Content-Type": declared,
          "Content-Disposition": 'inline; filename="evil.html"',
          "Content-Length": String(bytes.byteLength),
          "Set-Cookie": "up=1",
          "Cache-Control": "public, max-age=600",
          ETag: "x",
        },
      }),
    )

  it.each([
    ["PNG bytes declared image/jpeg", IMAGES.png, "image/jpeg", "image/png", "inline"],
    ["JPEG bytes", IMAGES.jpeg, "image/jpeg", "image/jpeg", "inline"],
    ["BMP bytes", IMAGES.bmp, "image/jpeg", "image/bmp", "inline"],
    ["SVG bytes declared image/svg+xml", IMAGES.svg, "image/svg+xml", "application/octet-stream", 'attachment; filename="file"'],
    ["HTML bytes declared image/png", IMAGES.html, "image/png", "application/octet-stream", 'attachment; filename="file"'],
    ["WebP bytes (logos only)", IMAGES.webp, "image/webp", "application/octet-stream", 'attachment; filename="file"'],
  ])("%s → %s, %s", async (_label, bytes, declared, type, disposition) => {
    server.use(image(bytes, declared))
    const response = await call({ path: "v2/file/9/download" })
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(type)
    expect(response.headers.get("Content-Disposition")).toBe(disposition)
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("Content-Length")).toBeNull()
    expect(response.headers.get("ETag")).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it("an upstream 404 on an image entry passes through without a disposition", async () => {
    server.use(http.get(`${UP}/v2/file/:id/download`, () => HttpResponse.json({ message: "Not found", code: 4 }, { status: 404 })))
    const response = await call({ path: "v2/file/9/download" })
    expect(response.status).toBe(404)
    expect(response.headers.get("Content-Disposition")).toBeNull()
    expect(await response.json()).toEqual({ message: "Not found", code: 4 })
  })

  it("never forwards Set-Cookie, Content-Disposition or Content-Length on a JSON answer either", async () => {
    server.use(
      http.get(`${UP}/v2/user/myself`, () =>
        HttpResponse.json({ id: 1 }, { headers: { "Set-Cookie": "a=1", "Content-Disposition": "attachment", "Content-Length": "8" } }),
      ),
    )
    const response = await call({ path: "v2/user/myself" })
    for (const name of ["Set-Cookie", "Content-Disposition", "Content-Length"]) expect(response.headers.get(name)).toBeNull()
  })
})

describe("proxy: uploads (Story 1.10 table, AD-13)", () => {
  const PICTURE = "v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload"
  const CAP = 4 * 1024 * 1024

  async function upload(path: string, parts: readonly Part[], transfer: Transfer = "header", headers: Record<string, string> = {}) {
    const payload = await multipart(parts)
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, multipartInit(payload, transfer, { cookie, ...headers })))
  }

  it("forwards one rebuilt part to the session's person, forcing isPublic=true; the name is the server's multipart name", async () => {
    let seen: { path: string; search: string; contentType: string | null; entries: [string, FormDataEntryValue][] } | undefined
    server.use(
      http.post(`${UP}/v2/health/type/Person/:id/relation/PersonHasProfilePictureFile/file/upload`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search, contentType: request.headers.get("Content-Type"), entries: [...(await request.formData()).entries()] }
        return HttpResponse.json({ id: 900, name: "me.jpg" })
      }),
    )
    const response = await upload(`${PICTURE}?isPublic=false`, [{ name: "file", bytes: IMAGES.jpeg, filename: "IMG 1.JPG", type: "text/html" }])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 900, name: "me.jpg" })
    expect(seen?.path).toBe("/api/v2/health/type/Person/4242/relation/PersonHasProfilePictureFile/file/upload")
    expect(seen?.search).toBe("?isPublic=true")
    expect(seen?.contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(seen?.entries).toHaveLength(1)
    const [name, file] = seen?.entries[0] ?? []
    expect(name).toBe("file")
    expect(file instanceof File && [file.type, file.name, file.size]).toEqual(["image/jpeg", "IMG_1.jpg", IMAGES.jpeg.byteLength])
  })

  it.each(["header", "chunked"] as const)("accepts exactly 4 MB (%s)", async (transfer) => {
    server.use(http.post(`${UP}/v2/health/type/Person/:id/relation/PersonHasProfilePictureFile/file/upload`, () => HttpResponse.json({ id: 1 })))
    const response = await upload(PICTURE, [{ name: "file", bytes: imageOfSize("png", CAP) }], transfer)
    expect(response.status).toBe(200)
  })

  describe("rejections, before any upstream call", () => {
    beforeEach(() => {
      upstreamCalls = trackAllRequests()
    })
    afterEach(() => expect(upstreamCalls()).toBe(0))

    it.each(["header", "chunked"] as const)("4 MB + 1 byte → 413 TOO_LARGE (%s)", async (transfer) => {
      await expectError(await upload(PICTURE, [{ name: "file", bytes: imageOfSize("png", CAP + 1) }], transfer), 413, "TOO_LARGE")
    })

    it.each([
      ["SVG renamed .png", [{ name: "file", bytes: IMAGES.svg, filename: "a.png" }]],
      ["HTML renamed .png", [{ name: "file", bytes: IMAGES.html, filename: "a.png" }]],
      ["GIF renamed .png", [{ name: "file", bytes: IMAGES.gif, filename: "a.png" }]],
    ] as const)("%s → 415 UNSUPPORTED_MEDIA", async (_label, parts) => {
      await expectError(await upload(PICTURE, parts), 415, "UNSUPPORTED_MEDIA")
    })

    it.each([
      ["two file parts", [{ name: "file", bytes: IMAGES.png }, { name: "file", bytes: IMAGES.png }]],
      ["a part named image", [{ name: "image", bytes: IMAGES.png }]],
    ] as const)("%s → 400 BAD_BODY (malformed multipart, spec F7-2 review)", async (_label, parts) => {
      await expectError(await upload(PICTURE, parts), 400, "BAD_BODY")
    })

    it("a JSON body → 415 UNSUPPORTED_MEDIA", async () => {
      const response = await call({ method: "POST", path: PICTURE, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: "x" }) })
      await expectError(response, 415, "UNSUPPORTED_MEDIA")
    })

    it("a PNG-only entry rejects a JPEG → 415", async () => {
      await expectError(await upload("v2/fixture/png-only", [{ name: "file", bytes: IMAGES.jpeg }]), 415, "UNSUPPORTED_MEDIA")
    })

    it.each(["x=1", "fileName=me.jpg"])("a client query (%s) on the picture upload → 400 BAD_QUERY", async (query) => {
      await expectError(await upload(`${PICTURE}?${query}`, [{ name: "file", bytes: IMAGES.png }]), 400, "BAD_QUERY")
    })
  })
})
