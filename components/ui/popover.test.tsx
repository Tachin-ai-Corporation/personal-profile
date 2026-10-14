import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover"

beforeEach(() => stubLayoutApis())

function setup() {
  render(
    <main>
      <Popover>
        <PopoverAnchor asChild>
          <div>
            <PopoverTrigger>Details</PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent aria-label="Details">
          <a href="/help">Help</a>
        </PopoverContent>
      </Popover>
      <button type="button">Elsewhere</button>
    </main>,
  )
  return screen.getByRole("button", { name: "Details" })
}

describe("Popover", () => {
  it("is non-modal, below the trigger with left edges aligned, on popover tokens", async () => {
    const trigger = setup()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole("dialog", { name: "Details" })
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("start")
    for (const name of ["bg-popover", "text-popover-foreground", "rounded-md", "shadow-lg", "motion-reduce:animate-none"]) {
      expect(dialog.className).toContain(name)
    }
    // Non-modal: the rest of the page stays reachable (no aria-hidden on it).
    expect(screen.getByRole("button", { name: "Elsewhere" }).closest("[aria-hidden='true']")).toBeNull()
    expect(await axeViolations()).toEqual([])
  })

  it("closes on Escape and on an outside press", async () => {
    const trigger = setup()
    fireEvent.click(trigger)
    await screen.findByRole("dialog")
    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    fireEvent.click(trigger)
    await screen.findByRole("dialog")
    // Radix starts listening for outside presses one task after opening.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    // A full press (Radix dismisses a primary-button press on its click).
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" })
    fireEvent.pointerDown(elsewhere, { button: 0 })
    fireEvent.pointerUp(elsewhere, { button: 0 })
    fireEvent.click(elsewhere, { button: 0 })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
