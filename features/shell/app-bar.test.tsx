import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SHELL_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { AppBar } from "./app-bar"

/**
 * The app bar (Story 1.8): wordmark + title, and "Return to 1health", which is
 * always rendered (never framed, D10), prevents the default navigation and calls
 * `returnToPortal()` (which runs the leave guard itself) exactly once.
 */

const { returnToPortal, requestLeave } = vi.hoisted(() => ({
  returnToPortal: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  requestLeave: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
}))
vi.mock("./leave", () => ({ returnToPortal, requestLeave }))

const PORTAL = "https://1health.demo.1health.io"

beforeEach(() => {
  returnToPortal.mockClear()
  requestLeave.mockClear()
})

afterEach(() => {
  cleanup()
})

describe("AppBar", () => {
  it("is a banner with the wordmark and the title, which is not a heading", () => {
    render(<AppBar portalUrl={PORTAL} />)
    const banner = screen.getByRole("banner")
    expect(banner).toHaveTextContent("1health")
    expect(banner).toHaveTextContent(SHELL_COPY.appTitle)
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.getByText("1health")).toHaveClass("text-primary", "font-bold")
  })

  it("renders Return to 1health as a 44 px link to the portal with the focus ring", () => {
    render(<AppBar portalUrl={PORTAL} />)
    const link = screen.getByRole("link", { name: SHELL_COPY.returnToPortal })
    expect(link).toHaveAttribute("href", PORTAL)
    expect(link).toHaveClass("min-h-11", "text-link-text", "hover:underline", "focus-ring")
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("a click prevents the default navigation and calls returnToPortal once (not requestLeave first)", () => {
    render(<AppBar portalUrl={PORTAL} />)
    const link = screen.getByRole("link", { name: SHELL_COPY.returnToPortal })
    const click = createEvent.click(link, { button: 0 })
    fireEvent(link, click)
    expect(click.defaultPrevented).toBe(true)
    expect(returnToPortal).toHaveBeenCalledOnce()
    expect(requestLeave).not.toHaveBeenCalled()
  })

  it("a modified or non-primary click keeps the browser's behavior and does not call returnToPortal", () => {
    render(<AppBar portalUrl={PORTAL} />)
    const link = screen.getByRole("link", { name: SHELL_COPY.returnToPortal })
    // Record whether the app prevented the default, then stop jsdom's (unimplemented) navigation.
    const prevented: boolean[] = []
    const record = (e: Event) => {
      prevented.push(e.defaultPrevented)
      e.preventDefault()
    }
    window.addEventListener("click", record)
    try {
      for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
        fireEvent(link, createEvent.click(link, { button: 0, ...init }))
      }
    } finally {
      window.removeEventListener("click", record)
    }
    expect(prevented).toEqual([false, false, false, false, false])
    expect(returnToPortal).not.toHaveBeenCalled()
  })

  it("axe-core reports zero violations", async () => {
    render(<AppBar portalUrl={PORTAL} />)
    expect(await axeViolations()).toEqual([])
  })
})
