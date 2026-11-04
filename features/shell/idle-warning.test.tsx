import { act, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { activity, ACTIVITY_CHANNEL, sessionEvents } from "@/lib/api"
import { IDLE_MESSAGES, LEAVE_GUARD_MESSAGES, SESSION_EXPIRED_MESSAGES } from "@/lib/shared/messages"
import { FakeBroadcastChannel } from "@/test/fake-broadcast-channel"
import { server } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TEST_PORTAL_URL, TestProviders, testIdle } from "@/test/providers"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import { formatIdleCountdown, IDLE_PING_TIMEOUT_MS, IDLE_SAFETY_MARGIN_MS, IdleWarning, idleMilestone } from "./idle-warning"
import { requestLeave, resetLeaveState } from "./leave"
import { PageFrame } from "./page-frame"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

/**
 * The idle warning (Story 1.6) with fake timers (clock + timeouts) and MSW at
 * the `/api` boundary. Deadlines are in server time: the page renders
 * `serverNow`, and the component keeps `offset = serverNow − Date.now()`.
 */

const PING = "/api/session/ping"
const T0 = 1_800_000_000_000
const SEC = 1_000
const MIN = 60 * SEC
/** Client deadlines run 30 s ahead of the server's 14:00 warning / 15:00 limit. */
const DEADLINE = 15 * MIN - 30 * SEC
const WARN = DEADLINE - MIN

let expired: ReturnType<typeof vi.fn<() => void>>
let pings: number

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
  vi.setSystemTime(T0)
  expired = vi.fn<() => void>()
  sessionEvents.subscribe("session-expired", expired)
  pings = 0
})

afterEach(() => {
  vi.useRealTimers()
})

function renderWarning(overrides: Partial<{ lastSeen: number; absoluteExpiresAt: number; serverNow: number }> = {}) {
  // Inside the providers: "Sign out now" uses the app's navigation (portal URL, router).
  return render(
    <TestProviders>
      <IdleWarning {...testIdle(T0)} {...overrides} />
    </TestProviders>,
  )
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Lets MSW and React settle (fake timers drive any internal timeouts). */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await advance(5)
}

const dialog = () => screen.queryByRole("alertdialog", { name: IDLE_MESSAGES.title })
const stayButton = () => screen.getByRole("button", { name: IDLE_MESSAGES.stay })
const isBusy = () => stayButton().getAttribute("aria-disabled") === "true"
const status = () => screen.getByRole("status").textContent
const signOutButton = () => screen.getByRole("button", { name: IDLE_MESSAGES.signOut })
const countdown = () => screen.getByRole("timer").textContent

/** A ping that answers 204 and echoes the (fake) server clock. */
function pingOk(): void {
  server.use(
    http.post(PING, () => {
      pings++
      return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(Date.now()) } })
    }),
  )
}

describe("IdleWarning: warning", () => {
  it("nothing before 13:30; at 13:30 (server 14:00 minus the 30 s margin) an alertdialog with the copy and a focused Stay signed in", async () => {
    expect(IDLE_SAFETY_MARGIN_MS).toBe(30 * SEC)
    renderWarning()
    await advance(WARN - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
    expect(document.activeElement).toBe(stayButton())
    expect(isBusy()).toBe(false)
    expect(status()).toBe("")
    // Redesign: a title, the countdown in the description, Sign out now then Stay signed in (the primary).
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([IDLE_MESSAGES.signOut, IDLE_MESSAGES.stay])
    expect(dialog()?.getAttribute("aria-describedby")).toBeTruthy()
    expect(document.getElementById(dialog()?.getAttribute("aria-describedby") ?? "")?.textContent).toBe("For your security, you'll be signed out in 1:00.")
    expect(expired).not.toHaveBeenCalled()
  })

  it("an outside press does not close it", async () => {
    renderWarning()
    await advance(WARN)
    fireEvent.pointerDown(document.body)
    await settle()
    expect(dialog()).not.toBeNull()
    expect(pings).toBe(0)
  })

  it("Escape means Stay signed in: one ping, and the warning closes once it lands", async () => {
    pingOk()
    renderWarning()
    await advance(WARN)
    fireEvent.keyDown(stayButton(), { key: "Escape" })
    fireEvent.keyDown(stayButton(), { key: "Escape" })
    await settle()
    expect(pings).toBe(1)
    expect(dialog()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it("lastActivity is the larger of the page's lastSeen and the recorded activity", async () => {
    activity.note(T0 + 2 * MIN)
    renderWarning()
    await advance(WARN)
    expect(dialog()).toBeNull()
    await advance(2 * MIN)
    expect(dialog()).not.toBeNull()
  })

  it("deadlines are in server time (client clock skew is removed)", async () => {
    const serverNow = T0 + 10 * MIN
    renderWarning({ serverNow, lastSeen: serverNow, absoluteExpiresAt: serverNow + 8 * 60 * MIN })
    await advance(WARN - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
  })
})

describe("IdleWarning: countdown (redesign)", () => {
  it("formats m:ss, rounding a part second up", () => {
    expect(formatIdleCountdown(60)).toBe("1:00")
    expect(formatIdleCountdown(59.2)).toBe("1:00")
    expect(formatIdleCountdown(59)).toBe("0:59")
    expect(formatIdleCountdown(9)).toBe("0:09")
    expect(formatIdleCountdown(0)).toBe("0:00")
    expect(formatIdleCountdown(-3)).toBe("0:00")
  })

  it("milestones: nothing above 30 s, then 30 s, then 10 s", () => {
    expect(idleMilestone(60)).toBe("")
    expect(idleMilestone(31)).toBe("")
    expect(idleMilestone(30)).toBe("30 seconds left before you're signed out.")
    expect(idleMilestone(11)).toBe("30 seconds left before you're signed out.")
    expect(idleMilestone(10)).toBe("10 seconds left before you're signed out.")
    expect(idleMilestone(1)).toBe("10 seconds left before you're signed out.")
  })

  it("counts down each second; the status speaks only at 30 s and 10 s, not every second", async () => {
    renderWarning()
    await advance(WARN)
    expect(countdown()).toBe("1:00")
    // The visible timer is not a live region (role timer is aria-live off).
    expect(screen.getByRole("timer").getAttribute("aria-live")).toBeNull()
    await advance(SEC)
    expect(countdown()).toBe("0:59")
    const heard = new Set<string>()
    for (let left = 59; left > 1; left--) {
      heard.add(status() ?? "")
      await advance(SEC)
    }
    expect(countdown()).toBe("0:01")
    expect([...heard]).toEqual(["", "30 seconds left before you're signed out.", "10 seconds left before you're signed out."])
    // At the deadline the warning still closes and publishes as before.
    await advance(SEC)
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it("the countdown runs to the absolute deadline when that comes first", async () => {
    // Absolute 14:30 server → 14:00 client, 30 s before the idle deadline: the warning opens at 13:30 with 0:30 left.
    renderWarning({ absoluteExpiresAt: T0 + 14 * MIN + 30 * SEC })
    await advance(WARN)
    expect(countdown()).toBe("0:30")
    expect(status()).toBe("30 seconds left before you're signed out.")
    await advance(30 * SEC)
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })
})

describe("IdleWarning: Sign out now (redesign)", () => {
  it("runs the portal exit: logout, then 1health in this tab; a second press does nothing", async () => {
    const calls: string[] = []
    server.use(
      http.post("/api/session/logout", () => {
        calls.push("logout")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const assign = vi.fn((url: string) => void calls.push(`assign ${url}`))
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/", search: "" })
    renderWarning()
    await advance(WARN)
    fireEvent.click(signOutButton())
    fireEvent.click(signOutButton())
    await settle()
    expect(calls).toEqual(["logout", `assign ${TEST_PORTAL_URL}`])
    expect(signOutButton().getAttribute("aria-busy")).toBe("true")
    expect(pings).toBe(0)
  })

  it("while Stay signed in is pending, Sign out now is aria-disabled and does nothing", async () => {
    let release: () => void = () => undefined
    server.use(http.post(PING, () => new Promise<Response>((resolve) => (release = () => resolve(new HttpResponse(null, { status: 204 }))))))
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/", search: "" })
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(signOutButton().getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(signOutButton())
    await settle()
    expect(assign).not.toHaveBeenCalled()
    release()
    await settle()
  })
})

describe("IdleWarning: Stay signed in", () => {
  it("ping 204 → dialog closes and the timer restarts from the echoed time", async () => {
    pingOk()
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(pings).toBe(1)
    expect(dialog()).toBeNull()
    const pingedAt = Date.now()
    await advance(pingedAt + WARN - Date.now() - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it.each([
    ["no X-PP-Activity-At", {}],
    ["a malformed X-PP-Activity-At", { "X-PP-Activity-At": "soon" }],
  ])("ping 204 with %s → the dialog closes and the timer restarts from when the ping started", async (_label, headers) => {
    server.use(http.post(PING, () => new HttpResponse(null, { status: 204, headers })))
    renderWarning()
    await advance(WARN)
    const pingedAt = Date.now()
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).toBeNull()
    expect(activity.lastAt()).toBe(pingedAt)
    await advance(pingedAt + WARN - Date.now() - SEC)
    expect(dialog()).toBeNull()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
    expect(expired).not.toHaveBeenCalled()
  })

  it("a double click sends one ping", async () => {
    server.use(
      http.post(PING, async () => {
        pings++
        await delay(10)
        return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(Date.now()) } })
      }),
    )
    renderWarning()
    await advance(WARN)
    const button = stayButton()
    fireEvent.click(button)
    fireEvent.click(button)
    await settle()
    expect(pings).toBe(1)
  })

  it("ping 401 SESSION_EXPIRED → dialog closes, session-expired published once, nothing reopens", async () => {
    server.use(http.post(PING, () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })))
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
    await advance(30 * SEC)
    expect(dialog()).toBeNull()
    await advance(5 * MIN)
    expect(expired).toHaveBeenCalledOnce()
  })

  it.each([
    ["a network error", () => HttpResponse.error()],
    ["503 SERVICE_DISABLED", () => HttpResponse.json({ errorCode: "SERVICE_DISABLED", source: "proxy" }, { status: 503 })],
  ])("ping %s → dialog stays open, button enabled and focused again", async (_label, resolver) => {
    server.use(http.post(PING, resolver))
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(dialog()).not.toBeNull()
    expect(isBusy()).toBe(false)
    expect(document.activeElement).toBe(stayButton())
    expect(expired).not.toHaveBeenCalled()
  })
})

describe("IdleWarning: session-expired stops it", () => {
  it("an external session-expired before 14 min → no warning ever opens and nothing else is published", async () => {
    renderWarning()
    await advance(10 * MIN)
    act(() => sessionEvents.publish("session-expired"))
    await advance(20 * MIN)
    expect(dialog()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
  })

  it("mounted after session-expired was published → stays stopped", async () => {
    sessionEvents.publish("session-expired")
    renderWarning({ lastSeen: T0 - 14 * MIN })
    await advance(5 * MIN)
    expect(dialog()).toBeNull()
  })
})

describe("IdleWarning: ping in flight at the deadline", () => {
  it("a ping still pending at the deadline that answers 204 with an echo → no session-expired, dialog closed", async () => {
    let acceptedAt = 0
    server.use(
      http.post(PING, async () => {
        acceptedAt = Date.now()
        await delay(8 * SEC)
        return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(acceptedAt) } })
      }),
    )
    renderWarning()
    await advance(DEADLINE - 3 * SEC)
    fireEvent.click(stayButton())
    await advance(5 * SEC) // past the deadline while the ping is pending
    expect(expired).not.toHaveBeenCalled()
    await advance(5 * SEC)
    await settle()
    expect(acceptedAt).toBe(T0 + DEADLINE - 3 * SEC)
    expect(expired).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it("a ping still pending at the deadline that fails → the deadline then publishes", async () => {
    server.use(
      http.post(PING, async () => {
        await delay(8 * SEC)
        return HttpResponse.json({ errorCode: "SERVICE_DISABLED", source: "proxy" }, { status: 503 })
      }),
    )
    renderWarning()
    await advance(DEADLINE - 3 * SEC)
    fireEvent.click(stayButton())
    await advance(5 * SEC)
    expect(expired).not.toHaveBeenCalled()
    await advance(5 * SEC)
    await settle()
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })

  it("a ping that never settles is abandoned after 10 s, so the deadline still publishes", async () => {
    server.use(
      http.post(PING, async () => {
        await delay("infinite")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(isBusy()).toBe(true)
    // The shared busy Button: aria-busy and its spinner while the ping is pending.
    expect(stayButton().getAttribute("aria-busy")).toBe("true")
    expect(stayButton().querySelector("[data-slot='button-spinner']")).not.toBeNull()
    await advance(IDLE_PING_TIMEOUT_MS)
    await settle()
    expect(isBusy()).toBe(false)
    expect(stayButton().getAttribute("aria-busy")).toBeNull()
    expect(dialog()).not.toBeNull()
    expect(expired).not.toHaveBeenCalled()
    await advance(MIN)
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })

  it("unmounted while the ping is pending → nothing is armed or published afterwards", async () => {
    server.use(
      http.post(PING, async () => {
        await delay(5 * SEC)
        return HttpResponse.json({ errorCode: "SERVICE_DISABLED", source: "proxy" }, { status: 503 })
      }),
    )
    const { unmount } = renderWarning()
    await advance(DEADLINE - 3 * SEC)
    fireEvent.click(stayButton())
    unmount()
    await advance(6 * SEC)
    await settle()
    await advance(30 * MIN)
    expect(expired).not.toHaveBeenCalled()
  })

  it("while pending: a status announces it and focus stays on the (aria-disabled) button", async () => {
    server.use(
      http.post(PING, async () => {
        await delay(5 * SEC)
        return new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": String(Date.now()) } })
      }),
    )
    renderWarning()
    await advance(WARN)
    fireEvent.click(stayButton())
    await settle()
    expect(isBusy()).toBe(true)
    expect(status()).toBe(IDLE_MESSAGES.staying)
    expect(document.activeElement).toBe(stayButton())
    await advance(5 * SEC)
    await settle()
    expect(dialog()).toBeNull()
  })
})

describe("IdleWarning: deadlines", () => {
  it("no action until 14:30 (server 15:00 minus the margin) → dialog closes, session-expired published, then stops", async () => {
    renderWarning()
    await advance(WARN)
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

  it("30 s before absoluteExpiresAt, while active → session-expired published without a warning", async () => {
    renderWarning({ absoluteExpiresAt: T0 + 5 * MIN })
    for (let i = 0; i < 4; i++) {
      await advance(MIN)
      act(() => activity.note(Date.now()))
    }
    await advance(29 * SEC)
    expect(expired).not.toHaveBeenCalled()
    await advance(SEC)
    expect(expired).toHaveBeenCalledOnce()
    expect(dialog()).toBeNull()
  })

  it("a throttled tab catches up on visibilitychange", () => {
    renderWarning()
    // Jump the clock without running timers (a background tab's timers stall).
    vi.setSystemTime(T0 + 16 * MIN)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(expired).toHaveBeenCalledOnce()
  })

  it("focus re-evaluates too", () => {
    renderWarning()
    vi.setSystemTime(T0 + 14 * MIN + 10 * SEC)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(dialog()).not.toBeNull()
  })

  it("unmounting stops the timer", async () => {
    const { unmount } = renderWarning()
    unmount()
    await advance(20 * MIN)
    expect(expired).not.toHaveBeenCalled()
  })
})

describe("IdleWarning: cross-tab activity", () => {
  it("a newer t from another tab moves the deadlines and closes an open warning", async () => {
    renderWarning()
    await advance(WARN)
    expect(dialog()).not.toBeNull()
    act(() => FakeBroadcastChannel.open(ACTIVITY_CHANNEL).deliver({ t: Date.now() }))
    expect(dialog()).toBeNull()
    await advance(WARN - SEC)
    expect(dialog()).toBeNull()
    expect(expired).not.toHaveBeenCalled()
    await advance(SEC)
    expect(dialog()).not.toBeNull()
  })

  it("an older t or a malformed message does not close the warning", async () => {
    renderWarning()
    await advance(WARN)
    const channel = FakeBroadcastChannel.open(ACTIVITY_CHANNEL)
    act(() => channel.deliver({ t: T0 - MIN }))
    act(() => channel.deliver({ t: Date.now(), id: 1 }))
    expect(dialog()).not.toBeNull()
  })
})

describe("IdleWarning in the page frame", () => {
  beforeEach(() => {
    resetLeaveState()
    setTestUrl("/?tab=contacts")
    server.use(
      http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })),
      http.get("/api/1h/v2/user/contact-point/list", () => HttpResponse.json([])),
    )
  })

  it("an idle timeout while the leave guard is open settles the leave as false, closes the guard, then shows the session-expired dialog", async () => {
    render(
      <TestProviders>
        <PageFrame page="profile" header={null} idle={testIdle(T0)}>
          <FixtureParticipant id="phone" label="Phone" displayOrder={2} />
        </PageFrame>
      </TestProviders>,
    )
    await settle()
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "1" } })
    let answer: boolean | undefined
    act(() => void requestLeave().then((ok) => (answer = ok)))
    await settle()
    expect(screen.getByRole("alertdialog", { name: LEAVE_GUARD_MESSAGES.title })).toBeTruthy()

    await advance(15 * MIN)
    await settle()
    expect(answer).toBe(false)
    expect(screen.queryByRole("alertdialog", { name: LEAVE_GUARD_MESSAGES.title })).toBeNull()
    expect(dialog()).toBeNull()
    expect(screen.getByRole("alertdialog", { name: SESSION_EXPIRED_MESSAGES.title })).toBeTruthy()
    expect(expired).toHaveBeenCalledOnce()
  })
})

describe("IdleWarning: accessibility", () => {
  it.each(["light", "dark"])("axe-core reports zero violations on the open dialog (%s) and the button has focus", async (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      renderWarning()
      await advance(WARN)
      expect(dialog()).not.toBeNull()
      vi.useRealTimers()
      const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
      expect(document.activeElement).toBe(stayButton())
    } finally {
      document.documentElement.classList.remove("dark")
    }
  })
})
