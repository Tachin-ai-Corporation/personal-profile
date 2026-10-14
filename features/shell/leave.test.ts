import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureClient } from "@/lib/api"
import { __resetSessionEventsForTests } from "@/lib/api/session-events"
import { server } from "../../test/server"
import { LOGOUT_WAIT_MS, requestLeave, returnToPortal, setLeaveGuard } from "./leave"

/**
 * The leave helpers (Story 1.7): the single leave guard, and `returnToPortal()`
 * = guard → logout (≤ 3 s, failures ignored) → `location.assign(PORTAL_URL)`.
 * MSW mocks the same-origin logout route; `window.location` is stubbed so the
 * navigation can be observed.
 */

const URL_LOGOUT = "http://localhost:3000/api/session/logout"
const PORTAL = "https://portal.example/applications"

let assign: ReturnType<typeof vi.fn<(url: string) => void>>
let logoutCalls: Request[]

beforeEach(() => {
  assign = vi.fn<(url: string) => void>()
  const real = window.location
  vi.stubGlobal("location", {
    href: real.href,
    origin: real.origin,
    protocol: real.protocol,
    host: real.host,
    hostname: real.hostname,
    port: real.port,
    pathname: real.pathname,
    search: real.search,
    hash: real.hash,
    assign,
    reload: vi.fn(),
    replace: vi.fn(),
  })
  configureClient({ sessionBinding: "binding-1", portalUrl: PORTAL })
  vi.spyOn(console, "error").mockImplementation(() => {})
  logoutCalls = []
})

afterEach(() => {
  setLeaveGuard(null)
  configureClient({})
  __resetSessionEventsForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function logoutOk() {
  server.use(
    http.post(URL_LOGOUT, ({ request }) => {
      logoutCalls.push(request)
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

describe("requestLeave / setLeaveGuard", () => {
  it("resolves true immediately when no guard is set", async () => {
    await expect(requestLeave()).resolves.toBe(true)
  })

  it("returns the guard's result, and clearing the guard restores true", async () => {
    const guard = vi.fn(async () => false)
    setLeaveGuard(guard)
    await expect(requestLeave()).resolves.toBe(false)
    expect(guard).toHaveBeenCalledOnce()
    guard.mockResolvedValueOnce(true)
    await expect(requestLeave()).resolves.toBe(true)
    setLeaveGuard(null)
    await expect(requestLeave()).resolves.toBe(true)
    expect(guard).toHaveBeenCalledTimes(2)
  })

  it("a later setLeaveGuard replaces the single guard", async () => {
    const first = vi.fn(async () => false)
    const second = vi.fn(async () => true)
    setLeaveGuard(first)
    setLeaveGuard(second)
    await expect(requestLeave()).resolves.toBe(true)
    expect(first).not.toHaveBeenCalled()
  })
})

describe("returnToPortal", () => {
  it("no guard: POST /api/session/logout with the binding, then navigates to PORTAL_URL", async () => {
    logoutOk()
    await returnToPortal()
    expect(logoutCalls).toHaveLength(1)
    expect(logoutCalls[0].method).toBe("POST")
    expect(logoutCalls[0].headers.get("X-PP-Session")).toBe("binding-1")
    expect(assign).toHaveBeenCalledExactlyOnceWith(PORTAL)
  })

  it("sends the logout with keepalive, so it survives the navigation", async () => {
    logoutOk()
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await returnToPortal()
    const call = fetchSpy.mock.calls.find(([input]) => String(input).endsWith("/api/session/logout"))
    expect(call).toBeDefined()
    expect((call![1] as RequestInit).keepalive).toBe(true)
    expect((call![1] as RequestInit).method).toBe("POST")
  })

  it("guard resolves false: no logout, no navigation", async () => {
    logoutOk()
    setLeaveGuard(async () => false)
    await returnToPortal()
    expect(logoutCalls).toHaveLength(0)
    expect(assign).not.toHaveBeenCalled()
  })

  it("guard resolves true: logout then navigation", async () => {
    logoutOk()
    const order: string[] = []
    setLeaveGuard(async () => {
      order.push("guard")
      return true
    })
    assign.mockImplementation(() => order.push("assign"))
    server.use(
      http.post(URL_LOGOUT, () => {
        order.push("logout")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await returnToPortal()
    expect(order).toEqual(["guard", "logout", "assign"])
  })

  it.each([
    ["500", () => HttpResponse.json({}, { status: 500 })],
    ["403 CSRF", () => HttpResponse.json({ code: "CSRF" }, { status: 403 })],
    ["network error", () => HttpResponse.error()],
  ])("a failed logout (%s) still navigates", async (_label, resolver) => {
    server.use(http.post(URL_LOGOUT, resolver))
    await returnToPortal()
    expect(assign).toHaveBeenCalledExactlyOnceWith(PORTAL)
  })

  it("a logout that hangs navigates after 3 s, not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    server.use(http.post(URL_LOGOUT, () => new Promise<never>(() => {})))
    let settled = false
    const done = returnToPortal().then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(LOGOUT_WAIT_MS - 1)
    expect(assign).not.toHaveBeenCalled()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(assign).toHaveBeenCalledExactlyOnceWith(PORTAL)
    expect(LOGOUT_WAIT_MS).toBe(3_000)
  })

  it("an unset portal URL: logout still runs, no navigation", async () => {
    logoutOk()
    configureClient({ sessionBinding: "binding-1" })
    await returnToPortal()
    expect(logoutCalls).toHaveLength(1)
    expect(assign).not.toHaveBeenCalled()
  })
})
