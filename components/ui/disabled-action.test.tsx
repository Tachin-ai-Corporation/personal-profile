import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { DisabledAction } from "./disabled-action"

beforeEach(() => stubLayoutApis())

const REASON = "You've reached the limit of 20 phones"

function setup(extra: { "aria-describedby"?: string } = {}) {
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
  render(
    <main>
      <form onSubmit={onSubmit}>
        <DisabledAction reason={REASON} {...extra}>
          Add phone
        </DisabledAction>
        <button type="submit">Submit</button>
      </form>
    </main>,
  )
  return { button: screen.getByRole("button", { name: "Add phone" }), onSubmit }
}

describe("DisabledAction", () => {
  it("is aria-disabled, stays in the tab order and is not the disabled attribute", () => {
    const { button } = setup()
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.hasAttribute("disabled")).toBe(false)
    expect(button.tabIndex).toBe(0)
    expect(button.getAttribute("type")).toBe("button")
    expect(button.className).toContain("h-11")
  })

  it("has the disabled-action look: muted fill, muted text, border, not-allowed cursor, no fade", () => {
    const { button } = setup()
    for (const name of ["bg-muted", "text-muted-foreground", "border-border", "aria-disabled:cursor-not-allowed", "aria-disabled:opacity-100", "dark:bg-muted"]) {
      expect(button.className).toContain(name)
    }
    expect(button.className).not.toContain("aria-disabled:opacity-50")
  })

  it("describes itself with the reason, always rendered, even with the tooltip closed", () => {
    const { button } = setup()
    const ids = (button.getAttribute("aria-describedby") ?? "").split(" ")
    expect(ids).toHaveLength(1)
    expect(document.getElementById(ids[0])?.textContent).toBe(REASON)
    expect(document.getElementById(ids[0])?.className).toContain("sr-only")
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("keeps a caller's aria-describedby before the reason", () => {
    const { button } = setup({ "aria-describedby": "row-hint" })
    const ids = (button.getAttribute("aria-describedby") ?? "").split(" ")
    expect(ids[0]).toBe("row-hint")
    expect(document.getElementById(ids[1])?.textContent).toBe(REASON)
  })

  it("does nothing on a click (no submit, no handler), focus stays; jsdom can't prove Enter/Space (see e2e)", () => {
    const { button, onSubmit } = setup()
    act(() => button.focus())
    fireEvent.click(button, { detail: 1 })
    // A keyboard-made click (Enter/Space) has detail 0.
    fireEvent.click(button, { detail: 0 })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button)
  })

  it("is always type=button, even if a caller passes a type at runtime", () => {
    const untyped = { type: "submit" } as object
    render(
      <DisabledAction reason={REASON} {...untyped}>
        Remove
      </DisabledAction>,
    )
    expect(screen.getByRole("button", { name: "Remove" }).getAttribute("type")).toBe("button")
  })

  it("shows the reason in a tooltip on focus, kept open by a mouse press and click", async () => {
    const { button } = setup()
    act(() => button.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe(REASON))
    fireEvent.pointerDown(button, { pointerType: "mouse" })
    fireEvent.pointerUp(button, { pointerType: "mouse" })
    fireEvent.click(button, { detail: 1 })
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    expect(screen.getByRole("tooltip")).not.toBeNull()
    // The reason stays the description while the tooltip is open (no second, competing id).
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(REASON)
  })

  it("shows the reason on tap (real event order: pointerdown → focus → pointerup → click)", async () => {
    const { button } = setup()
    fireEvent.pointerDown(button, { pointerType: "touch" })
    act(() => button.focus())
    fireEvent.pointerUp(button, { pointerType: "touch" })
    fireEvent.click(button, { detail: 1 })
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe(REASON))
  })

  it("has no axe violations, tooltip open", async () => {
    const { button } = setup()
    act(() => button.focus())
    await waitFor(() => expect(screen.getByRole("tooltip")).not.toBeNull())
    expect(await axeViolations()).toEqual([])
  })
})
