import { render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { InlineBanner } from "./inline-banner"

describe("InlineBanner", () => {
  it("error: card fill, error-strong text, alert icon; only the sentence is the alert, the action sits outside", () => {
    render(
      <InlineBanner variant="error" action={<button type="button">Retry</button>}>
        Couldn&apos;t load phones
      </InlineBanner>,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe("Couldn't load phones")
    const banner = alert.parentElement
    expect(banner?.getAttribute("data-variant")).toBe("error")
    expect(banner?.className).toContain("bg-card")
    expect(banner?.className).toContain("text-error-strong")
    expect(banner?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(alert.contains(screen.getByRole("button", { name: "Retry" }))).toBe(false)
    expect(banner?.hasAttribute("tabindex")).toBe(false)
  })

  it("info: accent fill, foreground text, info icon, a status region", () => {
    render(<InlineBanner variant="info">You have unsaved changes from your last visit.</InlineBanner>)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("You have unsaved changes from your last visit.")
    expect(status.parentElement?.className).toContain("bg-accent")
    expect(status.parentElement?.className).toContain("text-foreground")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("is focusable by script (tabIndex -1) when focusable, and forwards its ref", () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <InlineBanner ref={ref} variant="error" focusable>
        Couldn&apos;t save phone.
      </InlineBanner>,
    )
    expect(ref.current?.tabIndex).toBe(-1)
    ref.current?.focus()
    expect(document.activeElement).toBe(ref.current)
    // Script focus after a mouse action is :focus, not :focus-visible, so the ring is on :focus.
    for (const name of ["focus:outline-solid", "focus:outline-2", "focus:outline-offset-2", "focus:outline-ring", "focus:shadow-glow"]) {
      expect(ref.current?.className).toContain(name)
    }
  })

  it("has no focus styles when not focusable", () => {
    render(<InlineBanner variant="info">Info</InlineBanner>)
    expect(screen.getByRole("status").parentElement?.className).not.toContain("focus:")
  })

  it("callers can't overwrite its slot, variant or tabIndex; a caller data-slot is added", () => {
    const overrides = { "data-variant": "info", tabIndex: 0, "data-slot": "load-error", id: "banner" } as object
    render(
      <InlineBanner variant="error" {...overrides}>
        Couldn&apos;t load phones
      </InlineBanner>,
    )
    const banner = screen.getByRole("alert").parentElement
    expect(banner?.getAttribute("data-slot")).toBe("inline-banner load-error")
    expect(banner?.getAttribute("data-variant")).toBe("error")
    expect(banner?.hasAttribute("tabindex")).toBe(false)
    expect(banner?.id).toBe("banner")
  })

  it("has no axe violations", async () => {
    render(
      <main>
        <InlineBanner variant="error" action={<button type="button">Retry</button>}>
          Couldn&apos;t load phones
        </InlineBanner>
        <InlineBanner variant="info" focusable>
          This section changed since your draft. Choose which version to keep.
        </InlineBanner>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
