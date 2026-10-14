import { http, HttpResponse, delay } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO, idpTokenUrl, logoutAllUrl, PROD, refreshResponse } from "@/test/upstream-fixture"
import { SESSION_COOKIE, sealSession, unsealSession } from "./session"
import { REVOKE_TIMEOUT_MS } from "./revoke"
import { createLogoutHandler, createPingHandler, createRefreshHandler } from "./session-routes"
import type { SessionPayload } from "./types"

const IDP = idpTokenUrl(DEMO.apiRoot)
const now = () => NOW
const CLEARED = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

beforeEach(() => stubServerEnv())

async function request(path: string, method: string, session: SessionPayload | null = makeSession()): Promise<Request> {
  const headers: Record<string, string> = {}
  if (session) headers.cookie = `${SESSION_COOKIE}=${await sealSession(session)}`
  return new Request(`http://localhost:3000${path}`, { method, headers })
}

const refreshRequest = (session: SessionPayload | null = makeSession()) => request("/api/session/refresh", "POST", session)

function setCookieSession(response: Response): Promise<SessionPayload | null> {
  const header = response.headers.get("Set-Cookie") ?? ""
  return unsealSession(header.split(";")[0].split("=").slice(1).join("="))
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (l: string) => void lines.push(l)
  return { lines, restore: setLogSink({ info: push, warn: push, error: push }) }
}

describe("POST /api/session/refresh", () => {
  const handler = createRefreshHandler({ now })

  it("answers 200 without calling the IdP while the token is still valid, cookie unchanged", async () => {
    const calls = trackAllRequests()
    const response = await handler(await refreshRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(calls()).toBe(0)
  })

  it("refreshes an expiring token with no CSRF or binding header, keeps the sid, increments gen, never returns a token", async () => {
    server.use(http.post(IDP, () => HttpResponse.json(refreshResponse("fresh-access"))))
    const session = makeSession({ accessExpiresAt: NOW + 10_000 })
    const response = await handler(await refreshRequest(session))
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain("fresh-access")
    expect(await setCookieSession(response)).toMatchObject({ accessToken: "fresh-access", sid: session.sid, gen: 1 })
  })

  it("uses the session's environment for the IdP", async () => {
    server.use(http.post(idpTokenUrl(PROD.apiRoot), () => HttpResponse.json(refreshResponse("prod-access"))))
    const response = await handler(await refreshRequest(makeSession({ environment: "prod", accessExpiresAt: NOW })))
    expect(response.status).toBe(200)
  })

  it("clears the cookie on an IdP rejection (401 SESSION_EXPIRED)", async () => {
    server.use(http.post(IDP, () => HttpResponse.json({ error: "invalid_grant" }, { status: 400 })))
    const response = await handler(await refreshRequest(makeSession({ accessExpiresAt: NOW })))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
  })

  it("ends the session (401, cookie cleared) when the refreshed tokens exceed the cookie budget", async () => {
    server.use(http.post(IDP, () => HttpResponse.json(refreshResponse("a".repeat(4000)))))
    const response = await handler(await refreshRequest(makeSession({ accessExpiresAt: NOW })))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
  })

  it("keeps the cookie when the IdP is unavailable (503 REFRESH_UNAVAILABLE)", async () => {
    server.use(http.post(IDP, () => new HttpResponse(null, { status: 502 })))
    const response = await handler(await refreshRequest(makeSession({ accessExpiresAt: NOW })))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ errorCode: "REFRESH_UNAVAILABLE", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("answers 401 SESSION_EXPIRED without a session, clearing nothing when no cookie was sent", async () => {
    const response = await handler(await refreshRequest(null))
    expect(response.status).toBe(401)
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it.each([
    ["idle 15:01", { lastSeen: NOW - (15 * 60_000 + 1_000) }],
    ["absolute 8 h + 1 s", { iat: NOW - (8 * 3600_000 + 1_000), lastSeen: NOW - 60_000 }],
  ])("an aged session (%s) → 401 SESSION_EXPIRED + cookie cleared, no IdP call", async (_label, overrides) => {
    const calls = trackAllRequests()
    const response = await handler(await refreshRequest(makeSession({ ...overrides, accessExpiresAt: NOW })))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(calls()).toBe(0)
  })

  it("a refresh is not activity: lastSeen is unchanged", async () => {
    server.use(http.post(IDP, () => HttpResponse.json(refreshResponse("fresh-access"))))
    const session = makeSession({ accessExpiresAt: NOW + 10_000, lastSeen: NOW - 5 * 60_000 })
    const response = await handler(await refreshRequest(session))
    expect(response.headers.get("X-PP-Activity-At")).toBeNull()
    expect((await setCookieSession(response))?.lastSeen).toBe(NOW - 5 * 60_000)
  })

  it("answers 503 SERVICE_DISABLED with PP_DISABLED=1 without calling the IdP, logging only the template", async () => {
    const calls = trackAllRequests()
    const { lines, restore } = captureLogs()
    const disabled = createRefreshHandler({ now, env: testEnv({ PP_DISABLED: "1" }) })
    const response = await disabled(await refreshRequest(makeSession({ accessExpiresAt: NOW })))
    restore()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
    expect(JSON.parse(lines[0])).toMatchObject({ routeTemplate: "/api/session/refresh", status: 503 })
    expect(calls()).toBe(0)
  })

  it("uses the real clock and env by default", async () => {
    const at = Date.now()
    const response = await createRefreshHandler()(await refreshRequest(makeSession({ iat: at, lastSeen: at, accessExpiresAt: at + 600_000 })))
    expect(response.status).toBe(200)
  })
})

describe("POST /api/session/ping (Story 1.6)", () => {
  const handler = createPingHandler({ now })
  const pingRequest = (session: SessionPayload | null = makeSession(), extra: Record<string, string> = {}) =>
    request("/api/session/ping", "POST", session).then((r) => {
      for (const [name, value] of Object.entries(extra)) r.headers.set(name, value)
      return r
    })

  it("re-seals lastSeen = now and nothing else → 204, X-PP-Activity-At, no-store + nosniff, a PHI-free log line, no upstream call", async () => {
    const calls = trackAllRequests()
    const { lines, restore } = captureLogs()
    const session = makeSession({ lastSeen: NOW - 14 * 60_000 })
    const response = await handler(await pingRequest(session))
    restore()
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
    expect(response.headers.get("X-PP-Activity-At")).toBe(String(NOW))
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Pragma")).toBe("no-cache")
    expect(response.headers.get("Vary")).toBe("Cookie")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(await setCookieSession(response)).toEqual({ ...session, lastSeen: NOW })
    expect(calls()).toBe(0)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toEqual({
      kind: "request",
      requestId: expect.any(String),
      method: "POST",
      routeTemplate: "/api/session/ping",
      status: 204,
      durationMs: 0,
    })
    expect(lines[0]).not.toContain(session.accessToken)
    expect(lines[0]).not.toContain(session.sid)
  })

  it.each([
    ["55 s exactly", 55_000],
    ["already expired", -1],
  ])("token %s from expiry (race guard) → 401 TOKEN_EXPIRED, nothing re-sealed, so the client refreshes and replays", async (_label, left) => {
    const response = await handler(await pingRequest(makeSession({ accessExpiresAt: NOW + left })))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "TOKEN_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expect(response.headers.get("X-PP-Activity-At")).toBeNull()
  })

  it("token 56 s from expiry → re-sealed", async () => {
    const response = await handler(await pingRequest(makeSession({ accessExpiresAt: NOW + 56_000 })))
    expect(response.status).toBe(204)
  })

  it("a re-seal over the cookie budget → 401 SESSION_EXPIRED + cookie cleared (not a 500)", async () => {
    const response = await handler(await pingRequest(makeSession({ refreshToken: "r".repeat(4000) })))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
  })

  it("needs no CSRF or session-binding header (D5)", async () => {
    const response = await handler(await pingRequest(makeSession(), { "Sec-Fetch-Site": "cross-site" }))
    expect(response.status).toBe(204)
  })

  it("answers 503 SERVICE_DISABLED with PP_DISABLED=1, cookie untouched", async () => {
    const response = await createPingHandler({ now, env: testEnv({ PP_DISABLED: "1" }) })(await pingRequest())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("no cookie → 401 SESSION_EXPIRED, nothing cleared", async () => {
    const response = await handler(await pingRequest(null))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it.each([
    ["unsealable", () => new Request("http://localhost:3000/api/session/ping", { method: "POST", headers: { cookie: `${SESSION_COOKIE}=garbage` } })],
    ["idle 15:01", () => pingRequest(makeSession({ lastSeen: NOW - (15 * 60_000 + 1_000) }))],
    ["absolute 8 h + 1 s", () => pingRequest(makeSession({ iat: NOW - (8 * 3600_000 + 1_000), lastSeen: NOW }))],
  ])("%s cookie → 401 SESSION_EXPIRED + cookie cleared", async (_label, build) => {
    const response = await handler(await build())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(response.headers.get("X-PP-Activity-At")).toBeNull()
  })

  it("uses the real clock and env by default", async () => {
    const at = Date.now()
    const response = await createPingHandler()(await pingRequest(makeSession({ iat: at, lastSeen: at, accessExpiresAt: at + 600_000 })))
    expect(response.status).toBe(204)
    expect(Number(response.headers.get("X-PP-Activity-At"))).toBeGreaterThanOrEqual(at)
  })
})

describe("/api/session/logout (D3, D5)", () => {
  const handler = createLogoutHandler({ now })

  it.each(["POST", "GET"])("%s revokes on the platform with the session Bearer, then 204 + cleared cookie", async (method) => {
    const session = makeSession()
    let authorization: string | null = null
    server.use(
      http.post(logoutAllUrl(DEMO.apiRoot), ({ request: upstream }) => {
        authorization = upstream.headers.get("Authorization")
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const response = await handler(await request("/api/session/logout", method, session))
    expect(authorization).toBe(`Bearer ${session.accessToken}`)
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })

  it.each([
    ["401", () => new HttpResponse(null, { status: 401 }), '"status":401'],
    ["500", () => new HttpResponse("boom", { status: 500 }), '"status":500'],
    ["network error", () => HttpResponse.error(), "RevokeNetworkError"],
  ])("swallows a platform %s and logs it without the token", async (_label, resolver, expected) => {
    server.use(http.post(logoutAllUrl(DEMO.apiRoot), resolver))
    const session = makeSession()
    const { lines, restore } = captureLogs()
    const response = await handler(await request("/api/session/logout", "POST", session))
    restore()
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    const errorLine = lines.find((l) => l.includes('"kind":"error"')) ?? ""
    expect(errorLine).toContain(expected)
    expect(errorLine).toContain('"routeTemplate":"/api/session/logout"')
    for (const line of lines) expect(line).not.toContain(session.accessToken)
  })

  it("gives the platform 5 s by default", () => {
    expect(REVOKE_TIMEOUT_MS).toBe(5_000)
  })

  it("swallows a platform timeout", async () => {
    server.use(
      http.post(logoutAllUrl(DEMO.apiRoot), async () => {
        await delay("infinite")
        return new HttpResponse(null)
      }),
    )
    const { lines, restore } = captureLogs()
    const response = await createLogoutHandler({ now, revokeTimeoutMs: 20 })(await request("/api/session/logout", "POST"))
    restore()
    expect(response.status).toBe(204)
    expect(lines.some((l) => l.includes("RevokeTimeout"))).toBe(true)
  })

  it.each([
    ["idle 15:01", { lastSeen: NOW - (15 * 60_000 + 1_000) }],
    ["absolute 8 h + 1 s", { iat: NOW - (8 * 3600_000 + 1_000), lastSeen: NOW - 60_000 }],
  ])("an aged session (%s) is still revoked upstream once, then 204 + cleared cookie", async (_label, overrides) => {
    let revokes = 0
    server.use(
      http.post(logoutAllUrl(DEMO.apiRoot), () => {
        revokes += 1
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const response = await handler(await request("/api/session/logout", "POST", makeSession(overrides)))
    expect(revokes).toBe(1)
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
  })

  it("makes no upstream call without a session", async () => {
    const calls = trackAllRequests()
    const response = await createLogoutHandler()(await request("/api/session/logout", "GET", null))
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(calls()).toBe(0)
  })
})
