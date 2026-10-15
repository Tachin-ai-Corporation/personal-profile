import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Tooltip, TooltipProvider } from "./tooltip"

beforeEach(() => stubLayoutApis())
afterEach(() => vi.useRealTimers())

const TEXT = "Verify this number first"

function setup(props: { wide?: boolean } = {}) {
  render(
    <main>
      <Tooltip content={TEXT} wide={props.wide}>
        <button type="button">Make primary</button>
      </Tooltip>
      <button type="button">Elsewhere</button>
    </main>,
  )
  return screen.getByRole("button", { name: "Make primary" })
}

const tooltip = () => screen.queryByRole("tooltip")
/** Lets queued microtasks run. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

/**
 * A tap in the browser's real event order: pointerdown → focus → pointerup →
 * click. A pointer-made click has `detail` ≥ 1 (a keyboard-made one has 0).
 */
function tap(el: HTMLElement, pointerType: "touch" | "pen" = "touch"): void {
  fireEvent.pointerDown(el, { pointerType })
  act(() => el.focus())
  fireEvent.pointerUp(el, { pointerType })
  fireEvent.click(el, { detail: 1 })
}

describe("Tooltip", () => {
  it("opens on keyboard focus, above the control, and closes on blur", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await waitFor(() => expect(tooltip()?.textContent).toBe(TEXT))
    const content = document.querySelector<HTMLElement>("[data-slot='tooltip-content']")
    expect(content?.getAttribute("data-side")).toBe("top")
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip()?.id)
    act(() => trigger.blur())
    await waitFor(() => expect(tooltip()).toBeNull())
  })

  it("closes on Escape", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await waitFor(() => expect(tooltip()).not.toBeNull())
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(tooltip()).toBeNull())
  })

  it("opens on hover with a mouse and closes once the pointer leaves it and its content (hoverable, WCAG 1.4.13)", async () => {
    const trigger = setup()
    fireEvent.pointerMove(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(tooltip()).not.toBeNull())
    fireEvent.pointerLeave(trigger, { pointerType: "mouse", clientX: 0, clientY: 0 })
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 400, clientY: 400 })
    await waitFor(() => expect(tooltip()).toBeNull())
  })

  it("opens on tap, closes on a tap outside, and a second tap toggles it closed", async () => {
    const trigger = setup()
    tap(trigger)
    await settle()
    expect(tooltip()?.textContent).toBe(TEXT)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }), { pointerType: "touch" })
    await waitFor(() => expect(tooltip()).toBeNull())

    tap(trigger)
    await settle()
    expect(tooltip()).not.toBeNull()
    tap(trigger)
    await settle()
    expect(tooltip()).toBeNull()
  })

  it("a pen tap opens it like a touch tap", async () => {
    const trigger = setup()
    tap(trigger, "pen")
    await settle()
    expect(tooltip()?.textContent).toBe(TEXT)
  })

  it("a cancelled touch press does not make the next click a tap", async () => {
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "touch" })
    fireEvent.pointerCancel(trigger, { pointerType: "touch" })
    await settle()
    fireEvent.click(trigger, { detail: 1 })
    await settle()
    expect(tooltip()).toBeNull()
  })

  it("a touch press that ends without a click stops counting as a tap shortly after pointerup", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "touch" })
    fireEvent.pointerUp(trigger, { pointerType: "touch" })
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.click(trigger, { detail: 1 })
    act(() => vi.advanceTimersByTime(0))
    expect(tooltip()).toBeNull()
  })

  it("a keyboard-made click (detail 0) after a touch press is not a tap", async () => {
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "touch" })
    fireEvent.click(trigger, { detail: 0 })
    await settle()
    expect(tooltip()).toBeNull()
  })

  it("renders only the trigger when the content is empty: no popup, no description", async () => {
    for (const content of [null, undefined, false, ""]) {
      const { unmount } = render(
        <Tooltip content={content}>
          <button type="button">Plain</button>
        </Tooltip>,
      )
      const trigger = screen.getByRole("button", { name: "Plain" })
      act(() => trigger.focus())
      tap(trigger)
      await settle()
      expect(tooltip()).toBeNull()
      expect(trigger.hasAttribute("aria-describedby")).toBe(false)
      expect(trigger.hasAttribute("data-state")).toBe(false)
      unmount()
    }
  })

  it("shares the app-level provider: a short hover delay, then no delay when moving to the next trigger", async () => {
    render(
      <TooltipProvider>
        <Tooltip content="First">
          <button type="button">A</button>
        </Tooltip>
        <Tooltip content="Second">
          <button type="button">B</button>
        </Tooltip>
      </TooltipProvider>,
    )
    const a = screen.getByRole("button", { name: "A" })
    const b = screen.getByRole("button", { name: "B" })
    fireEvent.pointerMove(a, { pointerType: "mouse" })
    expect(tooltip()).toBeNull()
    await waitFor(() => expect(a.getAttribute("data-state")).toBe("delayed-open"))
    fireEvent.pointerLeave(a, { pointerType: "mouse", clientX: 0, clientY: 0 })
    fireEvent.pointerMove(document.body, { pointerType: "mouse", clientX: 400, clientY: 400 })
    await waitFor(() => expect(a.getAttribute("data-state")).toBe("closed"))
    fireEvent.pointerMove(b, { pointerType: "mouse" })
    await waitFor(() => expect(b.getAttribute("data-state")).toBe("instant-open"))
    expect(tooltip()?.textContent).toBe("Second")
  })

  it("closes on a mouse click on the trigger (Radix default)", async () => {
    const trigger = setup()
    fireEvent.pointerMove(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(tooltip()).not.toBeNull())
    fireEvent.pointerDown(trigger, { pointerType: "mouse" })
    fireEvent.click(trigger)
    await waitFor(() => expect(tooltip()).toBeNull())
  })

  it("uses the tooltip tokens, caption type, elevation-1 and a 6 px arrow; one line on desktop", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await waitFor(() => expect(tooltip()).not.toBeNull())
    const content = document.querySelector<HTMLElement>("[data-slot='tooltip-content']")
    for (const name of ["bg-tooltip", "text-tooltip-foreground", "text-caption", "rounded-sm", "shadow-md", "md:whitespace-nowrap", "motion-reduce:animate-none"]) {
      expect(content?.className).toContain(name)
    }
    const arrow = content?.querySelector("svg")
    expect(arrow?.getAttribute("height")).toBe("6")
    expect(arrow?.getAttribute("class")).toContain("fill-tooltip")
  })

  it("wraps at 320 px when wide", async () => {
    const trigger = setup({ wide: true })
    act(() => trigger.focus())
    await waitFor(() => expect(tooltip()).not.toBeNull())
    const content = document.querySelector<HTMLElement>("[data-slot='tooltip-content']")
    expect(content?.className).toContain("max-w-80")
    expect(content?.className).toContain("whitespace-normal")
    expect(content?.className).not.toContain("md:whitespace-nowrap")
  })

  it("has no axe violations open", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await waitFor(() => expect(tooltip()).not.toBeNull())
    expect(await axeViolations()).toEqual([])
  })
})
