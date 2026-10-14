import { act, fireEvent, render, screen } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureClient } from "@/lib/api"
import { __resetActivityForTests, noteActivity } from "@/lib/api/activity"
import { __resetSessionEventsForTests, publish, subscribe } from "@/lib/api/session-events"
import { IDLE_COPY } from "@/lib/shared/messages"
import { server } from "../../test/server"
import { FakeBroadcastChannel } from "../../test/fake-broadcast-channel"
import { IdleWarning } from "./idle-warning"

/**
 * The idle warning (Story 1.6) with fake timers (clock + timeouts) and MSW at
 * the `/api` boundary. Deadlines are in server time: the page renders
 * `serverNow`, and the component keeps `offset = serverNow − Date.now()`.
 */

const URL_PING = "http://localhost:3000/api/session/ping"
const T0 = 1_800_000_000_000
const SEC = 1_000
const MIN = 60 * SEC
const IDLE_SEC = 900

let expired: ReturnType<typeof vi.fn<() => void>>
let changed: ReturnType<typeof vi.fn<() => void>>
let pings: number

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
  __resetActivityForTests()
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
  vi.setSystemTime(T0)
  configureClient({ sessionBinding: "b" })
  vi.spyOn(console, "error").mockImplementation(() => {})
  expired = vi.fn<() => void>()
  subscribe("session-expired", expired)
  changed = vi.fn<() => void>()
  subscribe("session-changed", changed)
  pings = 0
})

afterEach(() => {
  __resetSessionEventsForTests()
  __resetActivityForTests()
  configureClient({})
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderWarning(props: Partial<{ lastSeen: number; absoluteExpiresAt: number; serverNow: number }> = {}) {
  return render(
    <IdleWarning
      idleTimeoutSec={IDLE_SEC}
      lastSeen={props.lastSeen ?? T0}
      absoluteExpiresAt={props.absoluteExpiresAt ?? T0 + 8 * 60 * MIN}
      serverNow={props.serverNow ?? T0}
    />,
  )
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Let MSW + React settle (fake timers drive any internal timeouts). */
async function settle() {
  for (let i = 0; i < 20; i++) await advance(5)
}

function dialog() {
  return screen.queryByRole("alertdialog")
}

function stayButton() {
  return screen.getByRole("button", { name: IDLE_COPY.stay })
}

/** A ping handler that answers 204 and echoes the server clock (the fake clock). */
function pingOk() {
  server.use(
    http.post(URL_PING, () => {
      pings++
      return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(Date.now()) } })
    }),
  )
}

describe("IdleWarning — warning", () => {
  it("nothing before 14 min; at 14 min an alertdialog with the copy and a focused Stay signed in", async () => {
    renderWarning()
    await advance(14 * MIN - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    const d = dialog()
    expect(d).not.toBeNull()
    expect(d).toHaveAccessibleName(IDLE_COPY.title)
    expect(screen.getByText(IDLE_COPY.title)).toBeInTheDocument()
    expect(stayButton()).toHaveFocus()
    expect(stayButton()).toBeEnabled()
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(expired).not.toHaveBeenCalled()
  })

  it("Escape and outside clicks do not close it", async () => {
    renderWarning()
    await advance(14 * MIN)
    fireEvent.keyDown(stayButton(), { key: "Escape" })
    fireEvent.pointerDown(document.body)
    await settle()
    expect(dialog()).not.toBeNull()
  })

  it("lastActivity is the larger of the page's lastSeen and lastActivityAt()", async () => {
    noteActivity(T0 + 2 * MIN)
    renderWarning()
    await advance(14 * MIN)
    expect(dialog()).toBeNull()
    await advance(2 * MIN)
    expect(dialog()).not.toBeNull()
  })

  it("deadlines are in server time (client clock skew is removed)", async () => {
    // The server clock is 10 min ahead of the client; lastSeen is server time.
    const serverNow = T0 + 10 * MIN
    renderWarning({ serverNow, lastSeen: serverNow, absoluteExpiresAt: serverNow + 8 * 60 * MIN })
    await advance(14 * MIN - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
  })
})

describe("IdleWarning — Stay signed in", () => {
  it("ping 204 → dialog closes and the timer restarts from the echoed time", async () => {
    pingOk()
    renderWarning()
    await advance(14 * MIN)
    fireEvent.click(stayButton())
    await settle()
    expect(pings).toBe(1)
    expect(dialog()).toBeNull()
    const pingedAt = Date.now()
    await advance(pingedAt + 14 * MIN - Date.now() - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it("ping 401 SESSION_EXPIRED → dialog closes, session-expired published once", async () => {
    server.use(http.post(URL_PING, () => HttpResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 })))
    renderWarning()
    await advance(14 * MIN)
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    await advance(30 * SEC)
    expect(dialog()).toBeNull()
    await advance(5 * MIN)
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })

  it("ping network error → dialog stays open with the button enabled", async () => {
    server.use(http.post(URL_PING, () => HttpResponse.error()))
    renderWarning()
    await advance(14 * MIN)
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).not.toBeNull()
    expect(stayButton()).toBeEnabled()
    expect(expired).not.toHaveBeenCalled()
  })

  it("ping 503 → stays open, button enabled", async () => {
    server.use(http.post(URL_PING, () => HttpResponse.json({ code: "SERVICE_DISABLED" }, { status: 503 })))
    renderWarning()
    await advance(14 * MIN)
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).not.toBeNull()
    expect(stayButton()).toBeEnabled()
  })
})

describe("IdleWarning — session events stop it", () => {
  it("ping 409 SESSION_CHANGED → dialog closes and nothing further happens through 20 min", async () => {
    server.use(http.post(URL_PING, () => HttpResponse.json({ code: "SESSION_CHANGED" }, { status: 409 })))
    renderWarning()
    await advance(14 * MIN)
    fireEvent.click(stayButton())
    await settle()
    expect(changed).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
    await advance(30 * SEC)
    expect(dialog()).toBeNull()
    await advance(6 * MIN)
    expect(dialog()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it.each([["session-changed"], ["session-expired"]] as const)(
    "an external %s before 14 min → no warning ever opens and the idle timer never publishes",
    async (event) => {
      renderWarning()
      await advance(10 * MIN)
      act(() => publish(event))
      const expiredCalls = expired.mock.calls.length
      await advance(20 * MIN)
      expect(dialog()).toBeNull()
      expect(expired.mock.calls.length).toBe(expiredCalls)
    },
  )
})

describe("IdleWarning — ping in flight at the deadline", () => {
  it("a ping delayed past 15:00 that answers 204 with an echo → no session-expired, dialog closed", async () => {
    let acceptedAt = 0
    server.use(
      http.post(URL_PING, async () => {
        acceptedAt = Date.now()
        await delay(90 * SEC)
        return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(acceptedAt) } })
      }),
    )
    renderWarning()
    await advance(14 * MIN + 30 * SEC)
    fireEvent.click(stayButton())
    await advance(MIN) // 15:30 — past the idle deadline while the ping is pending
    expect(expired).not.toHaveBeenCalled()
    await advance(MIN)
    await settle()
    expect(acceptedAt).toBe(T0 + 14 * MIN + 30 * SEC)
    expect(expired).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it("a ping delayed past 15:00 that fails → the deadline then publishes", async () => {
    server.use(
      http.post(URL_PING, async () => {
        await delay(90 * SEC)
        return HttpResponse.json({ code: "SERVICE_DISABLED" }, { status: 503 })
      }),
    )
    renderWarning()
    await advance(14 * MIN + 30 * SEC)
    fireEvent.click(stayButton())
    await advance(MIN)
    expect(expired).not.toHaveBeenCalled()
    await advance(MIN)
    await settle()
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })
})

describe("IdleWarning — deadlines", () => {
  it("no action until 15 min → dialog closes, session-expired published, then stops", async () => {
    renderWarning()
    await advance(14 * MIN)
    expect(dialog()).not.toBeNull()
    await advance(MIN - SEC)
    expect(expired).not.toHaveBeenCalled()
    await advance(SEC)
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    await advance(30 * MIN)
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
  })

  it("absoluteExpiresAt reached while active → session-expired published", async () => {
    renderWarning({ absoluteExpiresAt: T0 + 5 * MIN })
    for (let i = 0; i < 4; i++) {
      await advance(MIN)
      act(() => noteActivity(Date.now()))
    }
    expect(expired).not.toHaveBeenCalled()
    await advance(MIN)
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })

  it("a throttled tab catches up on visibilitychange / focus", async () => {
    renderWarning()
    // Jump the clock without running timers (a background tab's timers stall).
    vi.setSystemTime(T0 + 16 * MIN)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(expired).toHaveBeenCalledOnce()
  })

  it("focus re-evaluates too", async () => {
    renderWarning()
    vi.setSystemTime(T0 + 14 * MIN + 10 * SEC)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(dialog()).not.toBeNull()
  })
})

describe("IdleWarning — cross-tab activity", () => {
  it("a newer t from another tab moves the deadlines and closes an open warning", async () => {
    renderWarning()
    await advance(14 * MIN)
    expect(dialog()).not.toBeNull()
    const channel = FakeBroadcastChannel.instances.find((c) => c.name === "pp-activity" && !c.closed)!
    act(() => channel.deliver({ t: Date.now() }))
    expect(dialog()).toBeNull()
    await advance(14 * MIN - SEC)
    expect(dialog()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
  })

  it("an older t does not close the warning", async () => {
    renderWarning()
    await advance(14 * MIN)
    const channel = FakeBroadcastChannel.instances.find((c) => c.name === "pp-activity" && !c.closed)!
    act(() => channel.deliver({ t: T0 - MIN }))
    expect(dialog()).not.toBeNull()
  })
})

describe("IdleWarning — accessibility", () => {
  it("axe-core reports zero violations on the open dialog and the button has focus", async () => {
    renderWarning()
    await advance(14 * MIN)
    expect(dialog()).not.toBeNull()
    vi.useRealTimers()
    const axe = (await import("axe-core")).default
    const results = await axe.run(document.body)
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
    expect(stayButton()).toHaveFocus()
  })
})
