import { act, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSessionEvents } from "@/lib/api"
import { LOGIN_INTENT_KEY } from "@/lib/shared/login-intent"
import { onBeforeSessionExpired } from "./exit-hooks"
import { isUnloadConfirmed, resetLeaveState } from "./leave"
import { PortalUrlProvider } from "./portal-url-provider"
import { SessionDialog } from "./session-dialog"

const PORTAL = "https://portal.test"
const TITLE = "Your session ended"
const BODY = "Your changes are kept on this device. Relaunch from 1health to continue."

function setup(events = createSessionEvents(), assign = vi.fn()) {
  const view = render(
    <PortalUrlProvider portalUrl={PORTAL}>
      <main>
        <p>Page content</p>
      </main>
      <SessionDialog events={events} assign={assign} />
    </PortalUrlProvider>,
  )
  return { events, assign, ...view }
}

const nextTask = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

beforeEach(() => {
  resetLeaveState()
  window.sessionStorage.clear()
  window.history.replaceState(null, "", "/?tab=insurance#phone")
})
afterEach(() => document.documentElement.classList.remove("dark"))

describe("SessionDialog", () => {
  it("stays closed until session-expired is published", () => {
    setup()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("on publish: runs the callbacks, saves the intent, opens with focus on Return to 1health", () => {
    const order: string[] = []
    const off = onBeforeSessionExpired(() => {
      order.push(`callback, intent=${String(window.sessionStorage.getItem(LOGIN_INTENT_KEY))}`)
    })
    const { events } = setup()
    act(() => events.publish("session-expired"))
    off()
    expect(order).toEqual(["callback, intent=null"])
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBe("/?tab=insurance")
    const dialog = screen.getByRole("alertdialog", { name: TITLE })
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe(BODY)
    const action = screen.getByRole("button", { name: "Return to 1health" })
    expect(document.activeElement).toBe(action)
    expect(dialog.querySelectorAll("button")).toHaveLength(1)
    expect(document.querySelector("[data-slot='dialog-overlay']")?.className).toContain("bg-scrim")
  })

  it("opens on mount when the event was already published", () => {
    const events = createSessionEvents()
    events.publish("session-expired")
    setup(events)
    expect(screen.getByRole("alertdialog", { name: TITLE })).toBeTruthy()
  })

  it("is non-dismissable: Escape and an overlay click do nothing", async () => {
    const { events } = setup()
    act(() => events.publish("session-expired"))
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    await nextTask()
    const overlay = document.querySelector<HTMLElement>("[data-slot='dialog-overlay']")
    if (overlay) {
      fireEvent.pointerDown(overlay)
      fireEvent.click(overlay)
    }
    expect(screen.getByRole("alertdialog", { name: TITLE })).toBeTruthy()
  })

  it("Return to 1health goes to the portal in the same tab, without logout, beforeunload suppressed", () => {
    const { events, assign } = setup()
    act(() => events.publish("session-expired"))
    fireEvent.click(screen.getByRole("button", { name: "Return to 1health" }))
    expect(assign).toHaveBeenCalledWith(PORTAL)
    expect(isUnloadConfirmed()).toBe(true)
  })

  it("uses location.assign by default", () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/", search: "" })
    const events = createSessionEvents()
    render(
      <PortalUrlProvider portalUrl={PORTAL}>
        <SessionDialog events={events} />
      </PortalUrlProvider>,
    )
    act(() => events.publish("session-expired"))
    fireEvent.click(screen.getByRole("button", { name: "Return to 1health" }))
    expect(assign).toHaveBeenCalledWith(PORTAL)
  })

  it("a second publish opens nothing new and runs nothing again", () => {
    const callback = vi.fn()
    const off = onBeforeSessionExpired(callback)
    const events = { ...createSessionEvents() }
    const listeners: (() => void)[] = []
    // An event source that would deliver twice (the real one publishes once).
    events.subscribe = (_event, listener) => {
      listeners.push(listener)
      return () => undefined
    }
    setup(events)
    act(() => listeners.forEach((listener) => listener()))
    act(() => listeners.forEach((listener) => listener()))
    off()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const { events } = setup()
    act(() => events.publish("session-expired"))
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
