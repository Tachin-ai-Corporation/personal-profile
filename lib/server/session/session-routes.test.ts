import { http, HttpResponse, delay } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO, idpTokenUrl, logoutAllUrl, PROD, refreshResponse } from "@/test/upstream-fixture"
import { SESSION_COOKIE, sealSession, unsealSession } from "./session"
import { REVOKE_TIMEOUT_MS } from "./revoke"
import { createLogoutHandler, createRefreshHandler } from "./session-routes"
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

  it("answers 401 SESSION_EXPIRED without a session", async () => {
    expect((await handler(await refreshRequest(null))).status).toBe(401)
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
    const response = await createRefreshHandler()(await refreshRequest(makeSession({ accessExpiresAt: Date.now() + 600_000 })))
    expect(response.status).toBe(200)
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

  it("makes no upstream call without a session", async () => {
    const calls = trackAllRequests()
    const response = await createLogoutHandler()(await request("/api/session/logout", "GET", null))
    expect(response.status).toBe(204)
    expect(response.headers.get("Set-Cookie")).toBe(CLEARED)
    expect(calls()).toBe(0)
  })
})
