import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { onBeforeExit, onBeforeSessionExpired, runBeforeExit, runBeforeSessionExpired } from "./exit-hooks"
import { beginExit, confirmUnload, isUnloadConfirmed, requestLeave, resetLeaveState, setLeaveGuard, UNLOAD_CONFIRM_MS } from "./leave"
import { isAccountTab, isProfileTab, pageOfPath, type NavTarget } from "./nav-types"
import { LOGOUT_TIMEOUT_MS, navigate, type NavigateDeps } from "./navigate"

const PORTAL = "https://portal.test"

function setup(pathname = "/", overrides: Partial<NavigateDeps> = {}, search = "") {
  const calls: string[] = []
  const push = vi.fn((href: string) => void calls.push(`push ${href}`))
  const assign = vi.fn((url: string) => void calls.push(`assign ${url}`))
  const replaceState = vi.fn((_state: unknown, _unused: string, url?: string | URL | null) => void calls.push(`replace ${String(url)}`))
  const logout = vi.fn(async () => void calls.push("logout"))
  const deps: NavigateDeps = {
    router: { push },
    portalUrl: PORTAL,
    location: { pathname, search, assign },
    history: { replaceState },
    logout,
    ...overrides,
  }
  return { deps, calls, push, assign, replaceState, logout }
}

beforeEach(() => resetLeaveState())
afterEach(() => vi.useRealTimers())

describe("nav types", () => {
  it("recognises the typed tab enums and the two pages", () => {
    expect(isProfileTab("insurance")).toBe(true)
    expect(isProfileTab("personal")).toBe(false)
    expect(isAccountTab("organizations")).toBe(true)
    expect(isAccountTab(null)).toBe(false)
    expect(pageOfPath("/")).toBe("profile")
    expect(pageOfPath("/account")).toBe("account")
    expect(pageOfPath("/auth")).toBeNull()
  })
})

describe("requestLeave", () => {
  it("resolves true while no guard is set, and asks the guard otherwise", async () => {
    expect(await requestLeave()).toBe(true)
    const guard = vi.fn(async () => false)
    const clear = setLeaveGuard(guard)
    expect(await requestLeave()).toBe(false)
    clear()
    expect(await requestLeave()).toBe(true)
  })

  it("only clears the guard it set", async () => {
    const clearFirst = setLeaveGuard(async () => false)
    setLeaveGuard(async () => false)
    clearFirst()
    expect(await requestLeave()).toBe(false)
  })

  it("remembers a confirmed unload only briefly: reset after UNLOAD_CONFIRM_MS", () => {
    vi.useFakeTimers()
    expect(isUnloadConfirmed()).toBe(false)
    expect(beginExit()).toBe(true)
    confirmUnload()
    expect(isUnloadConfirmed()).toBe(true)
    vi.advanceTimersByTime(UNLOAD_CONFIRM_MS - 1)
    expect(isUnloadConfirmed()).toBe(true)
    expect(beginExit()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isUnloadConfirmed()).toBe(false)
    // The exit latch is freed too, in case the navigation didn't unload the page.
    expect(beginExit()).toBe(true)
  })

  it("resets a confirmed unload on pageshow (Back from the bfcache)", () => {
    confirmUnload()
    window.dispatchEvent(new Event("pageshow"))
    expect(isUnloadConfirmed()).toBe(false)
  })
})

describe("exit hooks", () => {
  it("runs every callback, catching failures, until unsubscribed", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const seen: string[] = []
    const offA = onBeforeExit(() => {
      throw new Error("boom")
    })
    const offB = onBeforeExit(() => void seen.push("exit"))
    const offC = onBeforeSessionExpired(() => void seen.push("expired"))
    runBeforeExit()
    runBeforeSessionExpired()
    expect(seen).toEqual(["exit", "expired"])
    expect(error).toHaveBeenCalledTimes(1)
    offA()
    offB()
    offC()
    runBeforeExit()
    runBeforeSessionExpired()
    expect(seen).toEqual(["exit", "expired"])
  })
})

describe("navigate: pages and tabs", () => {
  it("switches page with router.push after the guard (shared SWR cache kept)", async () => {
    const { deps, push } = setup("/")
    expect(await navigate({ page: "account" }, deps)).toBe(true)
    expect(push).toHaveBeenCalledWith("/account")
    expect(await navigate({ page: "account", tab: "provider", hash: "#npi" }, deps)).toBe(true)
    expect(push).toHaveBeenLastCalledWith("/account?tab=provider#npi")
  })

  it("does nothing for the current page with no tab or hash", async () => {
    const guard = vi.fn(async () => true)
    setLeaveGuard(guard)
    const { deps, push, replaceState } = setup("/account")
    expect(await navigate({ page: "account" }, deps)).toBe(true)
    expect(push).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(guard).not.toHaveBeenCalled()
  })

  it("changes tab on the current page by replace, dropping the hash", async () => {
    const { deps, replaceState, push } = setup("/")
    expect(await navigate({ page: "profile", tab: "insurance" }, deps)).toBe(true)
    expect(replaceState).toHaveBeenCalledWith(null, "", "/?tab=insurance")
    expect(await navigate({ page: "profile", tab: "contacts", hash: "email" }, deps)).toBe(true)
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/?tab=contacts#email")
    expect(await navigate({ page: "profile", hash: "phone" }, deps)).toBe(true)
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/#phone")
    expect(push).not.toHaveBeenCalled()
  })

  it("keeps every other search param on a same-page tab change, and sets only tab across pages", async () => {
    const { deps, replaceState, push } = setup("/", {}, "?x=1&tab=contacts&y=2")
    await navigate({ page: "profile", tab: "insurance" }, deps)
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/?x=1&tab=insurance&y=2")
    await navigate({ page: "profile", hash: "email" }, deps)
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/?x=1&tab=contacts&y=2#email")
    await navigate({ page: "account", tab: "personal" }, deps)
    expect(push).toHaveBeenLastCalledWith("/account?tab=personal")
  })

  it("uses the current page from the frame over the pathname", async () => {
    const { deps, replaceState } = setup("/fixture", { currentPage: "profile" })
    await navigate({ page: "profile", tab: "medical" }, deps)
    expect(replaceState).toHaveBeenCalledWith(null, "", "/fixture?tab=medical")
  })

  it.each<NavTarget>([{ page: "account" }, { page: "profile", tab: "medical" }, { external: "portal" }, { external: "handoff", href: "/handoff/portal?to=create-org" }])(
    "stays put when the guard refuses %j",
    async (target) => {
      setLeaveGuard(async () => false)
      const { deps, calls } = setup("/")
      expect(await navigate(target, deps)).toBe(false)
      expect(calls).toEqual([])
    },
  )
})

describe("navigate: exits", () => {
  it("portal: before-exit callbacks → logout → same-tab assign, beforeunload suppressed", async () => {
    const { deps, calls } = setup("/")
    const off = onBeforeExit(() => void calls.push("before-exit"))
    expect(await navigate({ external: "portal" }, deps)).toBe(true)
    off()
    expect(calls).toEqual(["before-exit", "logout", `assign ${PORTAL}`])
    expect(isUnloadConfirmed()).toBe(true)
  })

  it("portal: a failing logout still navigates", async () => {
    const { deps, assign } = setup("/", { logout: () => Promise.reject(new Error("down")) })
    await navigate({ external: "portal" }, deps)
    expect(assign).toHaveBeenCalledWith(PORTAL)
  })

  it("portal: waits at most 3 s for logout", async () => {
    vi.useFakeTimers()
    const { deps, assign } = setup("/", { logout: () => new Promise(() => undefined) })
    const pending = navigate({ external: "portal" }, deps)
    await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS - 1)
    expect(assign).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBe(true)
    expect(assign).toHaveBeenCalledWith(PORTAL)
    expect(LOGOUT_TIMEOUT_MS).toBe(3000)
  })

  it("portal: by default POSTs /api/session/logout", async () => {
    let posts = 0
    server.use(
      http.post("/api/session/logout", () => {
        posts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { deps, assign } = setup("/", { logout: undefined })
    await navigate({ external: "portal" }, deps)
    expect(posts).toBe(1)
    expect(assign).toHaveBeenCalledWith(PORTAL)
  })

  it("ignores a second exit while the first is in flight (latch), and frees it after a refusal", async () => {
    const { deps, logout, assign } = setup("/")
    let finish: () => void = () => undefined
    logout.mockImplementation(() => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))))
    const before = vi.fn()
    const off = onBeforeExit(before)
    const first = navigate({ external: "portal" }, deps)
    expect(await navigate({ external: "portal" }, deps)).toBe(false)
    expect(await navigate({ external: "handoff", href: "/handoff/portal?to=create-org" }, deps)).toBe(false)
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
    finish()
    expect(await first).toBe(true)
    off()
    expect(before).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledTimes(1)

    resetLeaveState()
    const clear = setLeaveGuard(async () => false)
    expect(await navigate({ external: "portal" }, deps)).toBe(false)
    clear()
    expect(await navigate({ external: "portal" }, deps)).toBe(true)
  })

  it("handoff: assign only, no logout and no before-exit callbacks", async () => {
    const { deps, calls, logout } = setup("/account")
    const before = vi.fn()
    const off = onBeforeExit(before)
    expect(await navigate({ external: "handoff", href: "/handoff/portal?to=tenant&tenantId=7" }, deps)).toBe(true)
    off()
    expect(calls).toEqual(["assign /handoff/portal?to=tenant&tenantId=7"])
    expect(logout).not.toHaveBeenCalled()
    expect(before).not.toHaveBeenCalled()
    expect(isUnloadConfirmed()).toBe(true)
  })
})
