import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { proxyPath } from "./config"
import { parseErrorBody } from "./errors-codes"
import { ApiResponseError, registerFetcher, swrFetcher, unregisterFetcher, unwrap } from "./fetcher"
import { isSwrKey, keys } from "./keys"
import { browserLocks, createRefreshCoordinator, REFRESH_LOCK } from "./refresh-coordinator"
import { activity } from "./activity"
import { endSession, recordUserActivity, startSession } from "./session"
import { createSessionEvents, sessionEvents } from "./session-events"

describe("session events", () => {
  it("publishes each event at most once per page lifetime and supports unsubscribe", () => {
    const events = createSessionEvents()
    const a = vi.fn()
    const b = vi.fn()
    const off = events.subscribe("session-expired", a)
    events.subscribe("session-expired", b)
    off()
    events.publish("session-expired")
    events.publish("session-expired")
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
    expect(events.hasPublished("session-expired")).toBe(true)
    expect(sessionEvents.hasPublished("session-expired")).toBe(false)
  })

  it("reset (test hook) forgets what was published, keeping listeners", () => {
    const events = createSessionEvents()
    const listener = vi.fn()
    events.subscribe("session-expired", listener)
    events.publish("session-expired")
    events.reset()
    expect(events.hasPublished("session-expired")).toBe(false)
    events.publish("session-expired")
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("session events: failing listeners", () => {
  it("still calls later listeners and never throws from publish", () => {
    const events = createSessionEvents()
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const later = vi.fn()
    events.subscribe("session-expired", () => {
      throw new Error("boom")
    })
    events.subscribe("session-expired", later)
    expect(() => events.publish("session-expired")).not.toThrow()
    expect(later).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })
})

describe("refresh coordinator", () => {
  it("single-flights concurrent refreshes and starts a new one after settling", async () => {
    const run = vi.fn(async () => ({ kind: "refreshed" as const }))
    const coordinator = createRefreshCoordinator(run, () => undefined)
    await Promise.all([coordinator.refresh(), coordinator.refresh()])
    expect(run).toHaveBeenCalledTimes(1)
    await coordinator.refresh()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("maps a thrown refresh to unavailable", async () => {
    const coordinator = createRefreshCoordinator(async () => {
      throw new Error("boom")
    }, () => undefined)
    expect(await coordinator.refresh()).toEqual({ kind: "unavailable" })
  })

  it("wraps navigator.locks, or reports none", async () => {
    vi.stubGlobal("navigator", {})
    expect(browserLocks()).toBeUndefined()
    const request = vi.fn(async (_name: string, callback: () => Promise<string>) => callback())
    vi.stubGlobal("navigator", { locks: { request } })
    expect(await browserLocks()?.request(REFRESH_LOCK, async () => "done")).toBe("done")
    expect(request).toHaveBeenCalledWith("pp-refresh", expect.any(Function))
    vi.stubGlobal("navigator", undefined)
    expect(browserLocks()).toBeUndefined()
  })
})

describe("errors-codes", () => {
  it.each([
    ["BFF envelope", '{"errorCode":"NOT_ALLOWED","source":"proxy"}', { errorCode: "NOT_ALLOWED", error: "fb", fromProxy: true }],
    ["BFF launch envelope", '{"errorCode":"LAUNCH_INVALID","source":"proxy","message":"m","retryable":false}', { errorCode: "LAUNCH_INVALID", userMessage: "m", retryable: false }],
    ["unknown BFF code", '{"errorCode":"NOPE","source":"proxy"}', { error: "fb", fromProxy: true }],
    ["unknown BFF code with launch fields", '{"errorCode":"NOPE","source":"proxy","message":"m","retryable":false}', { error: "fb", fromProxy: true, userMessage: "m", retryable: false }],
    ["upstream", '{"message":"m","code":7}', { upstreamCode: 7, platformMessage: "m", error: "m", fromProxy: false }],
    ["upstream non-integer code", '{"message":"","code":"7"}', { error: "fb", fromProxy: false }],
    ["non-JSON", "<html>", { error: "fb", fromProxy: false }],
    ["empty", "", { error: "fb", fromProxy: false }],
    ["array", "[1]", { error: "fb", fromProxy: false }],
  ])("parses %s", (_label, text, expected) => {
    expect(parseErrorBody(text, "fb")).toMatchObject(expected)
  })
})

describe("keys", () => {
  it("builds pp-prefixed keys", () => {
    expect(keys.myself()).toEqual(["pp", "myself"])
    expect(isSwrKey(["pp", "myself"])).toBe(true)
    expect(isSwrKey(["x", "myself"])).toBe(false)
    expect(isSwrKey("pp")).toBe(false)
    expect(proxyPath("v2/user/myself")).toBe("/api/1h/v2/user/myself")
  })
})

describe("fetcher", () => {
  it("unwraps success and throws ApiResponseError carrying the response", async () => {
    expect(await unwrap(Promise.resolve({ success: true, data: 1 }))).toBe(1)
    const failure = { success: false, errorCode: "UPSTREAM_ERROR" as const, error: "x" }
    await expect(unwrap(Promise.resolve(failure))).rejects.toMatchObject({ name: "ApiResponseError", response: failure })
    await expect(unwrap(Promise.resolve({ success: false }))).rejects.toThrow("Request failed")
  })

  it("dispatches SWR keys to the loader each module registered", async () => {
    const load = async (key: readonly unknown[]) => ["loaded", ...key]
    registerFetcher("npi", load)
    registerFetcher("npi", load)
    expect(await swrFetcher(keys.npi())).toEqual(["loaded", "pp", "npi"])
    unregisterFetcher("npi")
    await expect(swrFetcher(keys.npi())).rejects.toThrow("No fetcher for npi")
    await expect(swrFetcher(keys.addresses())).rejects.toThrow("No fetcher for addresses")
    await expect(swrFetcher("nope")).rejects.toBeInstanceOf(ApiResponseError)
    await expect(swrFetcher(["pp", "unknown"])).rejects.toThrow("No fetcher for unknown")
    await expect(swrFetcher(["pp", "constructor"])).rejects.toThrow("No fetcher for constructor")
  })
})

describe("registerFetcher", () => {
  it("throws on a second, different loader for a family, except under next dev", () => {
    const first = async () => 1
    registerFetcher("orgs", first)
    expect(() => registerFetcher("orgs", async () => 2)).toThrow("A fetcher is already registered for orgs")
    vi.stubEnv("NODE_ENV", "development")
    expect(() => registerFetcher("orgs", async () => 3)).not.toThrow()
    unregisterFetcher("orgs")
  })
})

describe("session calls", () => {
  it("startSession posts { lpl } only and maps success", async () => {
    let body: unknown
    server.use(
      http.post("/api/token", async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ok: true, environment: "prod" })
      }),
    )
    expect(await startSession("abc")).toEqual({ kind: "ok", environment: "prod" })
    expect(body).toEqual({ lpl: "abc" })
  })

  it.each([
    ["OK without success", () => HttpResponse.json({ ok: false }), { kind: "failed", retryable: true }],
    ["retryable failure", () => HttpResponse.json({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: "m" }, { status: 502 }), { kind: "failed", message: "m", retryable: true }],
    ["final failure", () => HttpResponse.json({ ok: false, errorCode: "WRONG_TENANT", source: "proxy", message: "t", retryable: false }, { status: 403 }), { kind: "failed", message: "t", retryable: false }],
    ["non-BFF failure", () => new HttpResponse("<html>", { status: 500 }), { kind: "failed", message: undefined, retryable: true }],
    ["network error", () => HttpResponse.error(), { kind: "network" }],
  ])("startSession maps %s", async (_label, resolver, expected) => {
    server.use(http.post("/api/token", resolver))
    expect(await startSession("abc")).toEqual(expected)
  })

  it("endSession posts logout", async () => {
    server.use(http.post("/api/session/logout", () => new HttpResponse(null, { status: 204 })))
    expect((await endSession()).statusCode).toBe(204)
  })

  it("recordUserActivity posts the ping as user activity, passes the signal, and notes the echo", async () => {
    let flag: string | null = null
    server.use(
      http.post("/api/session/ping", ({ request }) => {
        flag = request.headers.get("X-PP-Activity")
        return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": "77" } })
      }),
    )
    expect((await recordUserActivity()).statusCode).toBe(204)
    expect(flag).toBe("user")
    expect(activity.lastAt()).toBe(77)
    const controller = new AbortController()
    controller.abort()
    expect(await recordUserActivity({ signal: controller.signal })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })
})
