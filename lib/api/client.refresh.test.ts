import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { server } from "../../test/server"

/**
 * AD-16 client coordination: `callApi` on `401 TOKEN_EXPIRED` runs ONE
 * `POST /api/session/refresh` (single-flighted in the tab and across tabs via
 * `navigator.locks`), then replays each failed call once.
 *
 * The MSW refresh handler models the real route: it refreshes "upstream" only
 * while the token is expired (and counts those), otherwise answers 200 without
 * an upstream call — exactly what lets a second tab skip the IdP.
 */

const ORIGIN = "http://localhost:3000"
const PATH = "/api/1h/v2/user/myself"
const URL_API = `${ORIGIN}${PATH}`
const URL_REFRESH = `${ORIGIN}/api/session/refresh`
const BINDING = "test-binding"

type ClientModule = typeof import("./client")
type EventsModule = typeof import("./session-events")

let state: {
  /** The cookie's token looks expired (normal refresh calls upstream). */
  expired: boolean
  /** The upstream rejects the current token even though it looks valid; cleared by an upstream refresh. */
  upstreamRejects: boolean
  /** The upstream keeps rejecting even after a refresh. */
  alwaysRejects: boolean
  /** A refresh happened within the route's 10 s forced-refresh guard. */
  recentlyRefreshed: boolean
  upstreamRefreshes: number
  refreshRequests: number
  forcedRequests: number
  apiRequests: number
}
let refreshSeen: Request[]
let consoleSpy: ReturnType<typeof vi.spyOn>
let originalLocks: PropertyDescriptor | undefined

/** Load a fresh `client` + `session-events` pair (a "tab"), configured with the binding. */
async function loadTab(): Promise<{ client: ClientModule; events: EventsModule }> {
  vi.resetModules()
  const client = await import("./client")
  const events = await import("./session-events")
  client.configureClient({ sessionBinding: BINDING })
  return { client, events }
}

/** A fake `navigator.locks` with a FIFO mutex shared by everyone holding it. */
function installFakeLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_name: string, cb: () => Promise<unknown>) => {
    const run = tail.then(() => cb())
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  })
  Object.defineProperty(navigator, "locks", { value: { request }, configurable: true })
  return request
}

function removeLocks() {
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true })
}

function tokenRejected(): boolean {
  return state.expired || state.upstreamRejects || state.alwaysRejects
}

/** API handler: TOKEN_EXPIRED while the token is rejected, else success (or `onValid`). */
function useApi(onValid: () => Response = () => HttpResponse.json({ id: 1 })) {
  server.use(
    http.all(URL_API, async () => {
      state.apiRequests++
      return tokenRejected() ? HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }) : onValid()
    }),
  )
}

/**
 * Refresh handler modelling the route: a normal refresh calls upstream only
 * while expired; a forced one (`?force=1`) calls upstream unless a refresh
 * happened within the 10 s guard.
 */
function useRefreshOk() {
  server.use(
    http.post(URL_REFRESH, async ({ request }) => {
      state.refreshRequests++
      refreshSeen.push(request.clone())
      const forced = new URL(request.url).searchParams.get("force") === "1"
      if (forced) state.forcedRequests++
      const callUpstream = forced ? !state.recentlyRefreshed : state.expired
      // Check-then-await: two unserialized refreshes would BOTH count upstream.
      await delay(20)
      if (callUpstream) {
        state.upstreamRefreshes++
        state.expired = false
        state.upstreamRejects = false
        state.recentlyRefreshed = true
      }
      return HttpResponse.json({})
    }),
  )
}

function useRefreshFailure(make: () => Response) {
  server.use(
    http.post(URL_REFRESH, async () => {
      state.refreshRequests++
      await delay(20)
      return make()
    }),
  )
}

beforeEach(() => {
  state = {
    expired: true,
    upstreamRejects: false,
    alwaysRejects: false,
    recentlyRefreshed: false,
    upstreamRefreshes: 0,
    refreshRequests: 0,
    forcedRequests: 0,
    apiRequests: 0,
  }
  refreshSeen = []
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks")
})

afterEach(() => {
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks)
  else delete (navigator as unknown as Record<string, unknown>).locks
  consoleSpy.mockRestore()
  vi.restoreAllMocks()
})

describe("single flight in one tab", () => {
  it.each([
    ["with navigator.locks", true],
    ["without navigator.locks", false],
  ])("10 concurrent TOKEN_EXPIRED calls → exactly 1 refresh, all replay once and succeed (%s)", async (_l, withLocks) => {
    const lockRequest = withLocks ? installFakeLocks() : (removeLocks(), undefined)
    const { client } = await loadTab()
    useApi()
    useRefreshOk()

    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => client.callApi(`t/c${i}`, PATH)))

    for (const res of results) expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(state.refreshRequests).toBe(1)
    expect(state.upstreamRefreshes).toBe(1)
    expect(state.apiRequests).toBe(20) // 10 first attempts + 10 replays
    if (lockRequest) {
      expect(lockRequest).toHaveBeenCalledOnce()
      expect(lockRequest.mock.calls[0][0]).toBe("pp-refresh")
    }
  })

  it("the refresh is a same-origin POST carrying the registered X-PP-Session", async () => {
    removeLocks()
    const { client } = await loadTab()
    useApi()
    useRefreshOk()
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await client.callApi("t/hdr", PATH)

    expect(refreshSeen).toHaveLength(1)
    expect(refreshSeen[0].method).toBe("POST")
    expect(refreshSeen[0].headers.get("X-PP-Session")).toBe(BINDING)
    const refreshCall = fetchSpy.mock.calls.find((c) => c[0] === "/api/session/refresh")
    expect(refreshCall?.[1]?.credentials).toBe("same-origin")
  })

  it("replays the original request with the same method and body", async () => {
    removeLocks()
    const { client } = await loadTab()
    const bodies: string[] = []
    server.use(
      http.put(URL_API, async ({ request }) => {
        state.apiRequests++
        bodies.push(await request.text())
        return state.expired ? HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }) : HttpResponse.json({ ok: 1 })
      }),
    )
    useRefreshOk()

    const res = await client.callApi("t/put", PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ada" }),
    })

    expect(res).toMatchObject({ success: true, data: { ok: 1 } })
    expect(bodies).toEqual(['{"firstName":"Ada"}', '{"firstName":"Ada"}'])
  })

  it("a non-TOKEN_EXPIRED replay failure is returned as is", async () => {
    removeLocks()
    const { client } = await loadTab()
    useApi(() => HttpResponse.json({ code: "UPSTREAM_ERROR" }, { status: 502 }))
    useRefreshOk()
    const res = await client.callApi("t/502", PATH)
    expect(res).toMatchObject({ success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR" })
  })
})

describe("navigator.locks failure fallback", () => {
  it("lock request rejects before running the callback → refresh runs unlocked; call succeeds", async () => {
    const request = vi.fn(async () => {
      throw new DOMException("locks unavailable", "InvalidStateError")
    })
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true })
    const { client } = await loadTab()
    useApi()
    useRefreshOk()

    const res = await client.callApi("t/lockfail", PATH)

    expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(request).toHaveBeenCalledOnce()
    expect(state.refreshRequests).toBe(1)
  })

  it("lock request rejects after the callback produced a result → that result is used; call succeeds", async () => {
    const request = vi.fn(async (_name: string, cb: () => Promise<unknown>) => {
      await cb()
      throw new DOMException("lock released abnormally", "AbortError")
    })
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true })
    const { client } = await loadTab()
    useApi()
    useRefreshOk()

    const res = await client.callApi("t/lockfail-after", PATH)

    expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(state.refreshRequests).toBe(1)
    expect(state.apiRequests).toBe(2)
  })

  it("lock request rejects after the callback ran but before it produced a result → NETWORK_ERROR, no event", async () => {
    let refreshDone: Promise<unknown> = Promise.resolve()
    const request = vi.fn(async (_name: string, cb: () => Promise<unknown>) => {
      refreshDone = cb()
      throw new DOMException("lock released abnormally", "AbortError")
    })
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true })
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    events.subscribe("session-expired", onExpired)
    useApi()
    useRefreshOk()

    const res = await client.callApi("t/lockfail-noresult", PATH)
    await refreshDone

    expect(res).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(state.refreshRequests).toBe(1) // no second, unlocked refresh
    expect(state.apiRequests).toBe(1)
    expect(onExpired).not.toHaveBeenCalled()
  })
})

describe("two tabs sharing navigator.locks", () => {
  it("exactly 1 upstream refresh; the second tab's refresh sees a valid token", async () => {
    installFakeLocks()
    const tabA = await loadTab()
    const tabB = await loadTab()
    expect(tabA.client).not.toBe(tabB.client)
    useApi()
    useRefreshOk()

    const results = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => tabA.client.callApi(`a/${i}`, PATH)),
      ...Array.from({ length: 5 }, (_, i) => tabB.client.callApi(`b/${i}`, PATH)),
    ])

    for (const res of results) expect(res.success).toBe(true)
    expect(state.upstreamRefreshes).toBe(1)
    expect(state.refreshRequests).toBe(2) // one per tab; the second skips upstream
    expect(state.forcedRequests).toBe(0)
  })

  it("forced path: both tabs' replays hit TOKEN_EXPIRED → exactly 1 upstream forced refresh; both succeed", async () => {
    installFakeLocks()
    const tabA = await loadTab()
    const tabB = await loadTab()
    // The cookie token looks valid, but the upstream rejects it.
    state.expired = false
    state.upstreamRejects = true
    useApi()
    useRefreshOk()

    const [a, b] = await Promise.all([tabA.client.callApi("a/forced", PATH), tabB.client.callApi("b/forced", PATH)])

    expect(a).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(b).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(state.upstreamRefreshes).toBe(1)
    expect(state.forcedRequests).toBe(2) // the second tab's forced request hits the 10 s guard
    expect(state.refreshRequests).toBe(4) // one normal + one forced per tab
    expect(state.apiRequests).toBe(6) // first attempt + 2 replays per tab
  })
})

describe("refresh outcomes", () => {
  beforeEach(() => removeLocks())

  it("upstream rejects a valid-looking token → one normal + one forced refresh; call succeeds, no event", async () => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    state.expired = false
    state.upstreamRejects = true
    useApi()
    useRefreshOk()

    const results = await Promise.all([1, 2, 3].map((i) => client.callApi(`t/forced${i}`, PATH)))

    for (const res of results) expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(state.refreshRequests).toBe(2)
    expect(state.forcedRequests).toBe(1)
    expect(state.upstreamRefreshes).toBe(1) // on the forced one, although the token looked valid
    expect(new URL(refreshSeen[0].url).search).toBe("")
    expect(new URL(refreshSeen[1].url).search).toBe("?force=1")
    expect(refreshSeen[1].method).toBe("POST")
    expect(refreshSeen[1].headers.get("X-PP-Session")).toBe(BINDING)
    expect(state.apiRequests).toBe(9) // each call: first attempt + 2 replays
    expect(onExpired).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it("replay → TOKEN_EXPIRED, forced refresh ok, second replay → TOKEN_EXPIRED → session-expired once, no third replay", async () => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    events.subscribe("session-expired", onExpired)
    state.alwaysRejects = true
    useApi()
    useRefreshOk()

    const results = await Promise.all([1, 2, 3].map((i) => client.callApi(`t/again${i}`, PATH)))

    for (const res of results) {
      expect(res).toMatchObject({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    }
    expect(onExpired).toHaveBeenCalledOnce()
    expect(state.refreshRequests).toBe(2) // one normal + one forced
    expect(state.forcedRequests).toBe(1)
    expect(state.apiRequests).toBe(9) // each replayed exactly twice
  })

  it.each([
    ["401 SESSION_EXPIRED", 401, "SESSION_EXPIRED", "session-expired"],
    ["503 REFRESH_UNAVAILABLE", 503, "REFRESH_UNAVAILABLE", undefined],
  ] as const)("forced refresh fails with %s → handled like a normal refresh failure", async (_l, status, code, event) => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    state.expired = false
    state.upstreamRejects = true
    useApi()
    server.use(
      http.post(URL_REFRESH, async ({ request }) => {
        state.refreshRequests++
        await delay(10)
        if (new URL(request.url).searchParams.get("force") === "1") {
          state.forcedRequests++
          return HttpResponse.json({ code }, { status })
        }
        return HttpResponse.json({})
      }),
    )

    const results = await Promise.all([1, 2].map((i) => client.callApi(`t/ff${i}`, PATH)))

    for (const res of results) expect(res).toMatchObject({ success: false, statusCode: status, errorCode: code })
    expect(state.refreshRequests).toBe(2)
    expect(state.forcedRequests).toBe(1)
    expect(state.apiRequests).toBe(4) // first attempt + 1 replay each; no second replay
    expect(onExpired).toHaveBeenCalledTimes(event === "session-expired" ? 1 : 0)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each([
    ["409 SESSION_CHANGED", 409, "SESSION_CHANGED", "session-changed"],
    ["401 SESSION_EXPIRED", 401, "SESSION_EXPIRED", "session-expired"],
  ] as const)("refresh ok, replay returns %s → that error, its event fires once", async (_l, status, code, event) => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    useApi(() => HttpResponse.json({ code }, { status }))
    useRefreshOk()

    const results = await Promise.all([1, 2].map((i) => client.callApi(`t/replay-${code}-${i}`, PATH)))

    for (const res of results) expect(res).toMatchObject({ success: false, statusCode: status, errorCode: code })
    expect(state.refreshRequests).toBe(1)
    expect(state.apiRequests).toBe(4)
    expect(onChanged).toHaveBeenCalledTimes(event === "session-changed" ? 1 : 0)
    expect(onExpired).toHaveBeenCalledTimes(event === "session-expired" ? 1 : 0)
  })

  it("refresh 401 SESSION_EXPIRED → event once; every waiting call gets the 401", async () => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    useApi()
    useRefreshFailure(() => HttpResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 }))

    const results = await Promise.all([1, 2, 3].map((i) => client.callApi(`t/r401-${i}`, PATH)))

    for (const res of results) {
      expect(res).toMatchObject({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    }
    expect(onExpired).toHaveBeenCalledOnce()
    expect(onChanged).not.toHaveBeenCalled()
    expect(state.refreshRequests).toBe(1)
    expect(state.apiRequests).toBe(3) // no replay
  })

  it("refresh 409 SESSION_CHANGED → session-changed once; every waiting call gets the 409", async () => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    useApi()
    useRefreshFailure(() => HttpResponse.json({ code: "SESSION_CHANGED" }, { status: 409 }))

    const results = await Promise.all([1, 2, 3].map((i) => client.callApi(`t/r409-${i}`, PATH)))

    for (const res of results) {
      expect(res).toMatchObject({ success: false, statusCode: 409, errorCode: "SESSION_CHANGED" })
    }
    expect(onChanged).toHaveBeenCalledOnce()
    expect(onExpired).not.toHaveBeenCalled()
    expect(state.refreshRequests).toBe(1)
  })

  it("refresh 503 REFRESH_UNAVAILABLE → 503 error, no event; the next TOKEN_EXPIRED refreshes again", async () => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    useApi()
    useRefreshFailure(() => HttpResponse.json({ code: "REFRESH_UNAVAILABLE" }, { status: 503 }))

    const results = await Promise.all([1, 2, 3].map((i) => client.callApi(`t/r503-${i}`, PATH)))
    for (const res of results) {
      expect(res).toMatchObject({ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" })
    }
    expect(state.refreshRequests).toBe(1)

    const again = await client.callApi("t/r503-again", PATH)
    expect(again).toMatchObject({ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" })
    expect(state.refreshRequests).toBe(2)
    expect(onExpired).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it.each([
    ["network failure", () => HttpResponse.error(), undefined, "NETWORK_ERROR"],
    ["403 CSRF", () => HttpResponse.json({ code: "CSRF" }, { status: 403 }), 403, "CSRF"],
    ["503 SERVICE_DISABLED", () => HttpResponse.json({ code: "SERVICE_DISABLED" }, { status: 503 }), 503, "SERVICE_DISABLED"],
    ["non-JSON 500", () => new HttpResponse("<html>", { status: 500 }), 500, undefined],
  ] as const)("refresh %s → waiting calls get that error, no event", async (_l, make, statusCode, errorCode) => {
    const { client, events } = await loadTab()
    const onExpired = vi.fn()
    const onChanged = vi.fn()
    events.subscribe("session-expired", onExpired)
    events.subscribe("session-changed", onChanged)
    useApi()
    useRefreshFailure(make)

    const results = await Promise.all([1, 2].map((i) => client.callApi(`t/other-${i}`, PATH)))

    for (const res of results) {
      expect(res.success).toBe(false)
      expect(res.statusCode).toBe(statusCode)
      expect(res.errorCode).toBe(errorCode)
    }
    expect(state.refreshRequests).toBe(1)
    expect(state.apiRequests).toBe(2)
    expect(onExpired).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })
})
