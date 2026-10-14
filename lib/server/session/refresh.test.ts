import { http, HttpResponse, delay } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO, idpTokenUrl, PROD, refreshResponse } from "@/test/upstream-fixture"
import { EXPIRY_SKEW_MS, isAccessTokenFresh, refreshSession } from "./refresh"

const IDP = idpTokenUrl(DEMO.apiRoot)

describe("isAccessTokenFresh", () => {
  it("applies the 30 s skew", () => {
    expect(isAccessTokenFresh(makeSession({ accessExpiresAt: NOW + EXPIRY_SKEW_MS + 1 }), NOW)).toBe(true)
    expect(isAccessTokenFresh(makeSession({ accessExpiresAt: NOW + EXPIRY_SKEW_MS }), NOW)).toBe(false)
  })
})

describe("refreshSession", () => {
  it("posts the refresh grant to the session's environment and re-stamps the session", async () => {
    let form: URLSearchParams | undefined
    server.use(
      http.post(IDP, async ({ request }) => {
        form = new URLSearchParams(await request.text())
        return HttpResponse.json(refreshResponse("new-access", "new-refresh"))
      }),
    )
    const session = makeSession({ gen: 2 })
    const result = await refreshSession(session, NOW)
    expect(form?.get("grant_type")).toBe("refresh_token")
    expect(form?.get("refresh_token")).toBe(session.refreshToken)
    expect(form?.get("client_id")).toBe("public-client")
    expect(result).toEqual({
      kind: "refreshed",
      session: { ...session, accessToken: "new-access", refreshToken: "new-refresh", accessExpiresAt: NOW + 3_000_000, gen: 3 },
    })
  })

  it("keeps the old refresh token when none is returned", async () => {
    server.use(http.post(idpTokenUrl(PROD.apiRoot), () => HttpResponse.json(refreshResponse("a"))))
    const session = makeSession({ environment: "prod" })
    const result = await refreshSession(session, NOW)
    expect(result.kind === "refreshed" && result.session.refreshToken).toBe(session.refreshToken)
  })

  it.each([
    ["401", () => new HttpResponse(null, { status: 401 }), "rejected"],
    ["400 invalid_grant", () => HttpResponse.json({ error: "invalid_grant" }, { status: 400 }), "rejected"],
    ["400 other error", () => HttpResponse.json({ error: "invalid_request" }, { status: 400 }), "rejected"],
    ["400 non-JSON", () => new HttpResponse("nope", { status: 400 }), "rejected"],
    ["403", () => new HttpResponse(null, { status: 403 }), "rejected"],
    ["500", () => new HttpResponse(null, { status: 500 }), "unavailable"],
    ["503", () => new HttpResponse(null, { status: 503 }), "unavailable"],
    ["302", () => new HttpResponse(null, { status: 302, headers: { Location: "https://elsewhere.test" } }), "unavailable"],
    ["200 non-JSON", () => new HttpResponse("nope", { status: 200 }), "unavailable"],
    ["200 schema-invalid", () => HttpResponse.json({ token: "x" }), "unavailable"],
    ["network error", () => HttpResponse.error(), "unavailable"],
  ])("%s → %s", async (_label, resolver, kind) => {
    server.use(http.post(IDP, resolver))
    expect((await refreshSession(makeSession(), NOW)).kind).toBe(kind)
  })

  it("timeout → unavailable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    server.use(
      http.post(IDP, async () => {
        await delay("infinite")
        return HttpResponse.json({})
      }),
    )
    const pending = refreshSession(makeSession(), NOW)
    await vi.advanceTimersByTimeAsync(25_000)
    expect((await pending).kind).toBe("unavailable")
    vi.useRealTimers()
  })

  it("keeps whole milliseconds for a fractional expires_in (the session schema needs an integer)", async () => {
    server.use(http.post(IDP, () => HttpResponse.json({ access_token: "a", expires_in: 3599.5 })))
    const result = await refreshSession(makeSession(), NOW)
    expect(result.kind === "refreshed" && result.session.accessExpiresAt).toBe(NOW + 3_599_500)
    server.use(http.post(IDP, () => HttpResponse.json({ access_token: "a", expires_in: 3599.0005 })))
    const odd = await refreshSession(makeSession(), NOW)
    expect(odd.kind === "refreshed" && odd.session.accessExpiresAt).toBe(NOW + 3_599_000)
  })
})
