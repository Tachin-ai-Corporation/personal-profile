import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ReturnAction } from "./return-action"

/**
 * The framed/new-tab decision in `ReturnAction` (AD-5). `readFramed()` compares
 * `window.self !== window.top`, so we redefine `window.top` to force each path.
 */

const HREF = "https://portal.example/applications"
let originalTop: PropertyDescriptor | undefined

function setFramed(framed: boolean) {
  originalTop ??= Object.getOwnPropertyDescriptor(window, "top")
  // Framed: window.top is a different object from window (=== window.self).
  Object.defineProperty(window, "top", { configurable: true, value: framed ? {} : window })
}

afterEach(() => {
  cleanup()
  if (originalTop) {
    Object.defineProperty(window, "top", originalTop)
    originalTop = undefined
  }
})

describe("ReturnAction", () => {
  it("opens a new tab for a `return` action when framed", () => {
    setFramed(true)
    render(<ReturnAction label="Return to 1health" href={HREF} action="return" />)
    const link = screen.getByRole("link", { name: "Return to 1health" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(link).toHaveAttribute("href", HREF)
  })

  it("stays in the same tab for a `return` action when top-level", () => {
    setFramed(false)
    render(<ReturnAction label="Return to 1health" href={HREF} action="return" />)
    const link = screen.getByRole("link", { name: "Return to 1health" })
    expect(link).not.toHaveAttribute("target")
    expect(link).toHaveAttribute("href", HREF)
  })

  it("always opens a new tab for a `new-tab` action, even when top-level", () => {
    setFramed(false)
    render(<ReturnAction label="Open in a new tab" href={HREF} action="new-tab" />)
    const link = screen.getByRole("link", { name: "Open in a new tab" })
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})
