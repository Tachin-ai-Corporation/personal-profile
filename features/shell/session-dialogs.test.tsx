import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { SWRConfig, unstable_serialize } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureClient, keys } from "@/lib/api"
import { __resetSessionEventsForTests, publish } from "@/lib/api/session-events"
import { SESSION_CHANGED_COPY, SESSION_EXPIRED_COPY } from "@/lib/shared/messages"
import { server } from "../../test/server"
import { MyselfName } from "./myself-name"
import { setLeaveGuard } from "./leave"
import { onBeforeSessionExpired, onSessionChanged, SessionDialogs } from "./session-dialogs"

/**
 * `SessionDialogs` (Story 1.7): the single listener for `session-expired` /
 * `session-changed`, its hook registries, first-event-wins, the SWR clear on
 * `session-changed`, framing, non-dismissability and accessibility.
 */

const PORTAL = "https://portal.example/applications"
const URL_MYSELF = "http://localhost:3000/api/1h/v2/user/myself"

let originalTop: PropertyDescriptor | undefined
let unsubscribers: (() => void)[]
let errorSpy: ReturnType<typeof vi.spyOn>
let reload: ReturnType<typeof vi.fn<() => void>>
let assign: ReturnType<typeof vi.fn<(url: string) => void>>

function setFramed(framed: boolean) {
  originalTop ??= Object.getOwnPropertyDescriptor(window, "top")
  Object.defineProperty(window, "top", { configurable: true, value: framed ? {} : window })
}

beforeEach(() => {
  unsubscribers = []
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  reload = vi.fn<() => void>()
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
    reload,
    replace: vi.fn(),
  })
  configureClient({ sessionBinding: "b", portalUrl: PORTAL })
})

afterEach(() => {
  cleanup()
  for (const u of unsubscribers) u()
  __resetSessionEventsForTests()
  configureClient({})
  if (originalTop) {
    Object.defineProperty(window, "top", originalTop)
    originalTop = undefined
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function track(unsubscribe: () => void) {
  unsubscribers.push(unsubscribe)
  return unsubscribe
}

/** A fresh SWR cache per test, optionally seeded. */
function renderDialogs(opts: { cache?: Map<string, unknown>; children?: ReactNode } = {}) {
  const cache = opts.cache ?? new Map()
  return render(
    <SWRConfig
      value={{
        provider: () => cache as never,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
      }}
    >
      <main>
        <h1>Personal Profile</h1>
        {opts.children}
      </main>
      <SessionDialogs portalUrl={PORTAL} />
    </SWRConfig>,
  )
}

function dialog() {
  return screen.queryByRole("alertdialog")
}

function fire(event: "session-expired" | "session-changed") {
  act(() => publish(event))
}

async function axeViolations(): Promise<string[]> {
  const axe = (await import("axe-core")).default
  const results = await axe.run(document.body)
  return results.violations.map((v) => `${v.id}: ${v.help}`)
}

describe("SessionDialogs — nothing until an event", () => {
  it("renders nothing and the page stays visible", () => {
    renderDialogs()
    expect(dialog()).toBeNull()
    expect(screen.getByRole("heading", { name: "Personal Profile" })).toBeInTheDocument()
  })
})

describe("SessionDialogs — session-expired", () => {
  it("runs every onBeforeSessionExpired callback in order, then opens the dialog with a focused link", async () => {
    setFramed(false)
    const order: string[] = []
    track(
      onBeforeSessionExpired(() => {
        order.push(`a:${dialog() === null ? "closed" : "open"}`)
      }),
    )
    track(onBeforeSessionExpired(() => order.push("b")))
    const changed = vi.fn()
    track(onSessionChanged(changed))
    renderDialogs()

    fire("session-expired")

    expect(order).toEqual(["a:closed", "b"])
    expect(changed).not.toHaveBeenCalled()
    const d = dialog()
    expect(d).not.toBeNull()
    expect(d).toHaveAccessibleName(SESSION_EXPIRED_COPY.title)
    expect(d).toHaveAccessibleDescription(SESSION_EXPIRED_COPY.body)
    const link = screen.getByRole("link", { name: SESSION_EXPIRED_COPY.action })
    expect(link).toHaveAttribute("href", PORTAL)
    expect(link).not.toHaveAttribute("target")
    expect(link).toHaveClass("min-h-11")
    await waitFor(() => expect(link).toHaveFocus())
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("clicking Return to 1health makes no logout call and never consults the leave guard", async () => {
    setFramed(false)
    const guard = vi.fn(async () => true)
    setLeaveGuard(guard)
    let logoutCalls = 0
    server.use(
      http.post("http://localhost:3000/api/session/logout", () => {
        logoutCalls++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    // jsdom cannot navigate; stop the link's default action after it is dispatched.
    let clicked = false
    const preventNavigation = (event: Event) => {
      clicked = true
      event.preventDefault()
    }
    document.addEventListener("click", preventNavigation)
    try {
      renderDialogs()
      fire("session-expired")
      fireEvent.click(screen.getByRole("link", { name: SESSION_EXPIRED_COPY.action }))
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })
      expect(clicked).toBe(true)
      expect(guard).not.toHaveBeenCalled()
      expect(logoutCalls).toBe(0)
      expect(assign).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener("click", preventNavigation)
      setLeaveGuard(null)
    }
  })

  it("a throwing callback is logged by name only; later callbacks and the dialog still run", () => {
    const later = vi.fn()
    track(
      onBeforeSessionExpired(() => {
        throw new RangeError("draft write failed: secret-value")
      }),
    )
    track(onBeforeSessionExpired(later))
    renderDialogs()

    fire("session-expired")

    expect(later).toHaveBeenCalledOnce()
    expect(dialog()).not.toBeNull()
    const logged = (errorSpy.mock.calls as unknown[][]).map((c) => c.map(String).join(" ")).join("\n")
    expect(logged).toContain("RangeError")
    expect(logged).not.toContain("secret-value")
  })

  it("an unsubscribed callback does not run", () => {
    const cb = vi.fn()
    const unsubscribe = onBeforeSessionExpired(cb)
    unsubscribe()
    renderDialogs()
    fire("session-expired")
    expect(cb).not.toHaveBeenCalled()
  })

  it("framed: the action is a 'Close and reopen from 1health' button that does nothing", async () => {
    setFramed(true)
    renderDialogs()
    fire("session-expired")

    expect(screen.queryByRole("link")).toBeNull()
    const button = screen.getByRole("button", { name: SESSION_EXPIRED_COPY.framedAction })
    await waitFor(() => expect(button).toHaveFocus())
    fireEvent.click(button)
    expect(dialog()).not.toBeNull()
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it("is non-dismissable: Escape and outside clicks keep it open, with no close button", () => {
    renderDialogs()
    fire("session-expired")
    const link = screen.getByRole("link", { name: SESSION_EXPIRED_COPY.action })
    fireEvent.keyDown(link, { key: "Escape" })
    fireEvent.pointerDown(document.body)
    fireEvent.click(document.body)
    expect(dialog()).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
  })

  it("keeps the page mounted behind the overlay", () => {
    renderDialogs()
    fire("session-expired")
    expect(document.querySelector("main h1")?.textContent).toBe("Personal Profile")
  })

  it("axe-core reports zero violations and the link has focus", async () => {
    setFramed(false)
    renderDialogs()
    fire("session-expired")
    const link = screen.getByRole("link", { name: SESSION_EXPIRED_COPY.action })
    await waitFor(() => expect(link).toHaveFocus())
    expect(await axeViolations()).toEqual([])
    expect(link).toHaveFocus()
  })

  it("axe-core reports zero violations on the framed variant", async () => {
    setFramed(true)
    renderDialogs()
    fire("session-expired")
    const button = screen.getByRole("button", { name: SESSION_EXPIRED_COPY.framedAction })
    await waitFor(() => expect(button).toHaveFocus())
    expect(await axeViolations()).toEqual([])
  })
})

describe("SessionDialogs — session-changed", () => {
  it("runs onSessionChanged callbacks, no expired callbacks, and opens the Reload dialog", async () => {
    const order: string[] = []
    track(onSessionChanged(() => order.push("a")))
    track(onSessionChanged(() => order.push("b")))
    const expired = vi.fn()
    track(onBeforeSessionExpired(expired))
    renderDialogs()

    fire("session-changed")

    expect(order).toEqual(["a", "b"])
    expect(expired).not.toHaveBeenCalled()
    const d = dialog()
    expect(d).toHaveAccessibleName(SESSION_CHANGED_COPY.title)
    expect(d).not.toHaveAttribute("aria-describedby")
    const button = screen.getByRole("button", { name: SESSION_CHANGED_COPY.reload })
    expect(button).toHaveClass("min-h-11")
    await waitFor(() => expect(button).toHaveFocus())
  })

  it("callback errors are isolated", () => {
    const later = vi.fn()
    track(
      onSessionChanged(() => {
        throw new TypeError("boom")
      }),
    )
    track(onSessionChanged(later))
    renderDialogs()
    fire("session-changed")
    expect(later).toHaveBeenCalledOnce()
    expect(dialog()).not.toBeNull()
  })

  it("empties the whole SWR cache without refetching", async () => {
    let hits = 0
    server.use(
      http.get(URL_MYSELF, () => {
        hits++
        return HttpResponse.json({ id: 42, personId: 7, firstName: "Ada", lastName: "Lovelace" })
      }),
    )
    const key = unstable_serialize(keys.myself())
    const cache = new Map<string, unknown>([[key, { data: { id: 42, personId: 7, firstName: "Ada", lastName: "Lovelace" } }]])
    renderDialogs({ cache, children: <MyselfName /> })
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()

    fire("session-changed")

    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).toBeNull())
    expect((cache.get(key) as { data?: unknown } | undefined)?.data).toBeUndefined()
    // Give any (wrong) revalidation a chance to fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(hits).toBe(0)
  })

  it("Reload calls window.location.reload()", () => {
    renderDialogs()
    fire("session-changed")
    fireEvent.click(screen.getByRole("button", { name: SESSION_CHANGED_COPY.reload }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it("is non-dismissable", () => {
    renderDialogs()
    fire("session-changed")
    const button = screen.getByRole("button", { name: SESSION_CHANGED_COPY.reload })
    fireEvent.keyDown(button, { key: "Escape" })
    fireEvent.pointerDown(document.body)
    expect(dialog()).not.toBeNull()
    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("axe-core reports zero violations and Reload has focus", async () => {
    renderDialogs()
    fire("session-changed")
    const button = screen.getByRole("button", { name: SESSION_CHANGED_COPY.reload })
    await waitFor(() => expect(button).toHaveFocus())
    expect(await axeViolations()).toEqual([])
    expect(button).toHaveFocus()
  })
})

describe("SessionDialogs — first event wins", () => {
  it("expired then changed: the expired dialog stays; no changed callbacks, no cache clear", async () => {
    const changed = vi.fn()
    track(onSessionChanged(changed))
    const key = unstable_serialize(keys.myself())
    const seeded = { data: { id: 42, personId: 7, firstName: "Ada", lastName: "Lovelace" } }
    const cache = new Map<string, unknown>([[key, seeded]])
    renderDialogs({ cache, children: <MyselfName /> })
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()

    fire("session-expired")
    fire("session-changed")

    expect(changed).not.toHaveBeenCalled()
    expect(dialog()).toHaveAccessibleName(SESSION_EXPIRED_COPY.title)
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: SESSION_CHANGED_COPY.reload })).toBeNull()
    expect((cache.get(key) as { data?: unknown }).data).toEqual(seeded.data)
  })

  it("changed then expired: the changed dialog stays; no expired callbacks", () => {
    const expired = vi.fn()
    track(onBeforeSessionExpired(expired))
    const changed = vi.fn()
    track(onSessionChanged(changed))
    renderDialogs()

    fire("session-changed")
    fire("session-expired")

    expect(changed).toHaveBeenCalledOnce()
    expect(expired).not.toHaveBeenCalled()
    expect(dialog()).toHaveAccessibleName(SESSION_CHANGED_COPY.title)
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
    expect(screen.queryByRole("link", { name: SESSION_EXPIRED_COPY.action })).toBeNull()
  })
})
