import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONTROL_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { InfoIconButton } from "./info-icon-button"
import { INFO_POPOVER_HOVER_DELAY_MS, InfoPopover, LinkTextButton, type InfoPopoverProps } from "./info-popover"

beforeEach(() => {
  stubLayoutApis()
  // jsdom has no layout: give every element a box unless it (or an ancestor) is display: none.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[style*='display: none']") ? [] : [{}]) as unknown as DOMRectList
  })
})

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
/** Lets Radix finish what it does one task later (outside-press listeners, focus scope). */
const settle = () => wait(0)

function setup(props: Partial<InfoPopoverProps> = {}) {
  render(
    <main>
      <button type="button">Before</button>
      <InfoPopover
        trigger={<InfoIconButton aria-label="Primary contact for Acme Labs" icon="info" />}
        title="Primary contact"
        {...props}
      >
        {props.children ?? (
          <>
            <p>Ann Lee</p>
            <a href="tel:+14155550100">(415) 555-0100</a>
            <a href="mailto:ann@acme.test">ann@acme.test</a>
          </>
        )}
      </InfoPopover>
      <button type="button">After</button>
    </main>,
  )
  return screen.getByRole("button", { name: "Primary contact for Acme Labs" })
}

const popover = () => screen.queryByRole("dialog")

/** A press in the browser's real event order: pointerdown → focus → pointerup → click (`detail` ≥ 1). */
function press(el: HTMLElement, pointerType: "mouse" | "touch"): void {
  fireEvent.pointerDown(el, { pointerType, button: 0 })
  act(() => el.focus())
  fireEvent.pointerUp(el, { pointerType, button: 0 })
  fireEvent.click(el, { detail: 1, button: 0 })
}

function tab(shift = false): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey: shift })
}

describe("InfoPopover: opening", () => {
  it("keyboard focus opens it below the trigger without moving focus; the trigger has aria-expanded and aria-controls", async () => {
    const onOpenChange = vi.fn()
    const trigger = setup({ onOpenChange })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    act(() => trigger.focus())
    const dialog = await screen.findByRole("dialog", { name: "Primary contact" })
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id)
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("start")
    expect(dialog.className).toContain("w-70")
    expect(onOpenChange).toHaveBeenCalledWith(true)
    await settle()
    expect(document.activeElement).toBe(trigger)
    expect(await axeViolations()).toEqual([])
  })

  it("mouse hover opens it after 150 ms, and it closes once the pointer has left trigger and content", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await wait(INFO_POPOVER_HOVER_DELAY_MS - 60)
    expect(popover()).toBeNull()
    await waitFor(() => expect(popover()).not.toBeNull())

    // Moving from the trigger into the content keeps it open.
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
    fireEvent.pointerEnter(popover() as HTMLElement, { pointerType: "mouse" })
    await wait(150)
    expect(popover()).not.toBeNull()
    fireEvent.pointerLeave(popover() as HTMLElement, { pointerType: "mouse" })
    await waitFor(() => expect(popover()).toBeNull())
  })

  it("a pointer passing over (leaving before 150 ms) never opens it; touch pointers don't hover", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
    fireEvent.pointerEnter(trigger, { pointerType: "touch" })
    await wait(INFO_POPOVER_HOVER_DELAY_MS + 50)
    expect(popover()).toBeNull()
  })

  it("re-entering while open cancels the hover close", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(popover()).not.toBeNull())
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await wait(200)
    expect(popover()).not.toBeNull()
  })

  it("a click on a hover-opened popover pins it: leaving no longer closes it, a second click does", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(popover()).not.toBeNull())
    press(trigger, "mouse")
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
    await wait(200)
    expect(popover()).not.toBeNull()
    press(trigger, "mouse")
    await waitFor(() => expect(popover()).toBeNull())
  })

  it("a tap opens it (the focus of the tap doesn't open it first), a second tap closes it, a tap outside closes it", async () => {
    const trigger = setup()
    press(trigger, "touch")
    expect(popover()).not.toBeNull()
    await settle()
    press(trigger, "touch")
    await waitFor(() => expect(popover()).toBeNull())

    press(trigger, "touch")
    await settle()
    const outside = screen.getByRole("button", { name: "Before" })
    fireEvent.pointerDown(outside, { pointerType: "touch", button: 0 })
    fireEvent.pointerUp(outside, { pointerType: "touch", button: 0 })
    fireEvent.click(outside, { detail: 1, button: 0 })
    await waitFor(() => expect(popover()).toBeNull())
  })

  it("Enter and Space (keyboard clicks) toggle it", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    fireEvent.click(trigger, { detail: 0 })
    await waitFor(() => expect(popover()).toBeNull())
    fireEvent.click(trigger, { detail: 0 })
    expect(popover()).not.toBeNull()
  })

  it("a press that ends without a click doesn't stop a later keyboard focus from opening it", async () => {
    vi.useFakeTimers()
    try {
      const trigger = setup()
      fireEvent.pointerDown(trigger, { pointerType: "mouse" })
      fireEvent.pointerUp(trigger, { pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(1000))
      act(() => trigger.focus())
      expect(popover()).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("a cancelled press is forgotten at once", () => {
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "touch" })
    fireEvent.pointerCancel(trigger, { pointerType: "touch" })
    act(() => trigger.focus())
    expect(popover()).not.toBeNull()
  })
})

describe("InfoPopover: keyboard and closing", () => {
  it("Tab goes from the trigger into the links, on to the next control after the trigger, and Shift+Tab comes back", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    tab()
    expect(document.activeElement?.textContent).toBe("(415) 555-0100")
    tab(true)
    expect(document.activeElement).toBe(trigger)
    expect(popover()).not.toBeNull()
    tab()
    tab()
    // Between links the browser moves focus itself.
    act(() => screen.getByRole("link", { name: "ann@acme.test" }).focus())
    tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }))
    await waitFor(() => expect(popover()).toBeNull())
  })

  it("Escape from inside closes it and returns focus to the trigger without reopening it", async () => {
    const onOpenChange = vi.fn()
    const trigger = setup({ onOpenChange })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    tab()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" })
    await waitFor(() => expect(popover()).toBeNull())
    expect(document.activeElement).toBe(trigger)
    await settle()
    expect(popover()).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it("Escape with focus on the trigger closes it and keeps focus there", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    fireEvent.keyDown(trigger, { key: "Escape" })
    await waitFor(() => expect(popover()).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it("closes when focus leaves trigger and content (Shift+Tab to the previous control)", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    act(() => screen.getByRole("button", { name: "Before" }).focus())
    await waitFor(() => expect(popover()).toBeNull())
  })

  it("a blur with no new focus target (window switch) keeps it open", async () => {
    const trigger = setup()
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    fireEvent.blur(trigger, { relatedTarget: null })
    await settle()
    expect(popover()).not.toBeNull()
  })

  it("a hover-opened popover ignores focus moving elsewhere on the page", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(popover()).not.toBeNull())
    fireEvent.blur(trigger, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect(popover()).not.toBeNull()
  })

  it("with no links inside, Tab from the trigger is the browser's; Tab from the focused content with nothing after the trigger keeps focus there", async () => {
    render(
      <main>
        <InfoPopover trigger={<LinkTextButton>Acme Labs</LinkTextButton>} label="Support contact">
          <p>No links here</p>
        </InfoPopover>
      </main>,
    )
    const trigger = screen.getByRole("button", { name: "Acme Labs" })
    expect(trigger.className).toContain("text-link-text")
    expect(trigger.className).toContain("min-h-11")
    act(() => trigger.focus())
    const dialog = await screen.findByRole("dialog", { name: "Support contact" })
    const fromTrigger = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    trigger.dispatchEvent(fromTrigger)
    expect(fromTrigger.defaultPrevented).toBe(false)
    act(() => dialog.focus())
    const fromContent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    dialog.dispatchEvent(fromContent)
    // Radix's focus scope holds focus on an empty container: never lost.
    expect(fromContent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(dialog, { key: "ArrowDown" })
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    expect(popover()).not.toBeNull()
  })

  it("uses a given content id for aria-controls", async () => {
    const trigger = setup({ contentId: "acme-contact" })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    expect(trigger.getAttribute("aria-controls")).toBe("acme-contact")
    expect(document.getElementById("acme-contact")?.getAttribute("role")).toBe("dialog")
  })
})

describe("InfoPopover: state slots", () => {
  it("loading shows a spinner and the catalog line", async () => {
    const trigger = setup({ state: "loading" })
    act(() => trigger.focus())
    const status = await screen.findByRole("status")
    expect(status.textContent).toBe(CONTROL_MESSAGES.loading)
    expect(status.querySelector("svg.animate-spin")).not.toBeNull()
    expect(screen.queryByText("Ann Lee")).toBeNull()
  })

  it("forbidden shows the no-access line", async () => {
    const trigger = setup({ state: "forbidden" })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    expect(screen.getByText(STATE_MESSAGES.noAccess)).not.toBeNull()
  })

  it("error shows the catalog line and Try again., which retries with focus kept inside the popover", async () => {
    function Retrying() {
      const [state, setState] = useState<InfoPopoverProps["state"]>("error")
      return (
        <InfoPopover trigger={<LinkTextButton>Acme Labs</LinkTextButton>} title="Acme Labs" state={state} onRetry={() => setState("loading")}>
          <p>Loaded</p>
        </InfoPopover>
      )
    }
    render(<Retrying />)
    const trigger = screen.getByRole("button", { name: "Acme Labs" })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    expect(screen.getByText(CONTROL_MESSAGES.loadError)).not.toBeNull()
    tab()
    const retry = screen.getByRole("button", { name: CONTROL_MESSAGES.tryAgain })
    expect(document.activeElement).toBe(retry)
    expect(await axeViolations()).toEqual([])
    fireEvent.click(retry)
    expect(screen.getByRole("status").textContent).toBe(CONTROL_MESSAGES.loading)
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    await settle()
    expect(popover()).not.toBeNull()
  })

  it("Tab from the focused container (after Try again.) goes to the first link of the reloaded content", async () => {
    function Retrying() {
      const [state, setState] = useState<InfoPopoverProps["state"]>("error")
      return (
        <main>
          <InfoPopover trigger={<LinkTextButton>Acme Labs</LinkTextButton>} title="Acme Labs" state={state} onRetry={() => setState(undefined)}>
            <a href="mailto:support@acme.test">support@acme.test</a>
          </InfoPopover>
          <button type="button">After</button>
        </main>
      )
    }
    render(<Retrying />)
    act(() => screen.getByRole("button", { name: "Acme Labs" }).focus())
    await screen.findByRole("dialog")
    tab()
    fireEvent.click(screen.getByRole("button", { name: CONTROL_MESSAGES.tryAgain }))
    expect(document.activeElement).toBe(screen.getByRole("dialog"))
    tab()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "support@acme.test" }))
  })

  it("error takes a caller's line and shows no retry without onRetry", async () => {
    const trigger = setup({ state: "error", errorMessage: "Couldn't load the contact." })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    expect(screen.getByText("Couldn't load the contact.")).not.toBeNull()
    expect(screen.queryByRole("button", { name: CONTROL_MESSAGES.tryAgain })).toBeNull()
  })
})

describe("InfoPopover: review fixes", () => {
  it("a press released away from the trigger is forgotten at once, so a later keyboard focus opens it", () => {
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "mouse" })
    fireEvent.pointerUp(document.body, { pointerType: "mouse" })
    act(() => trigger.focus())
    expect(popover()).not.toBeNull()
  })

  it("a press cancelled anywhere is forgotten too; a release on the trigger keeps the press for its click", () => {
    const trigger = setup()
    fireEvent.pointerDown(trigger, { pointerType: "touch" })
    fireEvent.pointerCancel(document.body, { pointerType: "touch" })
    act(() => trigger.focus())
    expect(popover()).not.toBeNull()
    act(() => screen.getByRole("button", { name: "Before" }).focus())
    press(trigger, "touch")
    expect(popover()).not.toBeNull()
  })

  it("focus entering a hover-opened popover holds it open after the pointer leaves", async () => {
    const trigger = setup()
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" })
    await waitFor(() => expect(popover()).not.toBeNull())
    act(() => screen.getByRole("link", { name: "ann@acme.test" }).focus())
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
    await wait(200)
    expect(popover()).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "ann@acme.test" }))
  })

  it("skips hidden elements and reaches summary, contenteditable, iframe and media controls", async () => {
    render(
      <main>
        <InfoPopover trigger={<InfoIconButton aria-label="More" icon="info" />} label="More">
          <a href="#gone" style={{ display: "none" }}>
            Gone
          </a>
          <a href="#invisible" style={{ visibility: "hidden" }}>
            Invisible
          </a>
          <details>
            <summary>Details</summary>
          </details>
          <div contentEditable suppressContentEditableWarning aria-label="Note" role="textbox" />
          <iframe title="Map" />
          <video controls aria-label="Clip" />
        </InfoPopover>
        <button type="button">After</button>
      </main>,
    )
    act(() => screen.getByRole("button", { name: "More" }).focus())
    await screen.findByRole("dialog")
    tab()
    // The two hidden links are skipped.
    expect(document.activeElement?.textContent).toBe("Details")
  })

  it.each([
    ["contenteditable", <div key="x" contentEditable suppressContentEditableWarning aria-label="Note" role="textbox" />, true],
    ["iframe", <iframe key="x" title="Map" />, true],
    ["video with controls", <video key="x" controls aria-label="Clip" />, true],
    ["audio with controls", <audio key="x" controls aria-label="Sound" />, true],
    ["video without controls", <video key="x" aria-label="Clip" />, false],
    ["contenteditable=false", <div key="x" contentEditable={false} aria-label="Note" />, false],
  ])("Tab from the trigger counts a lone %s as reachable: %s", async (_name, element, reachable) => {
    render(
      <main>
        <InfoPopover trigger={<InfoIconButton aria-label="More" icon="info" />} label="More">
          {element}
        </InfoPopover>
        <button type="button">After</button>
      </main>,
    )
    const trigger = screen.getByRole("button", { name: "More" })
    act(() => trigger.focus())
    await screen.findByRole("dialog")
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    act(() => {
      trigger.dispatchEvent(event)
    })
    // Bridged (prevented) only when there is something reachable inside.
    expect(event.defaultPrevented).toBe(reachable)
  })

  it("when the trigger is the page's last stop, Tab out of the last link closes it with focus on the trigger (not wrapped back in)", async () => {
    render(
      <main>
        <InfoPopover trigger={<InfoIconButton aria-label="Last" icon="info" />} title="Last">
          <a href="#only">Only link</a>
        </InfoPopover>
      </main>,
    )
    act(() => screen.getByRole("button", { name: "Last" }).focus())
    await screen.findByRole("dialog")
    tab()
    expect(document.activeElement?.textContent).toBe("Only link")
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    act(() => {
      document.activeElement?.dispatchEvent(event)
    })
    await waitFor(() => expect(popover()).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }))
    await settle()
    expect(popover()).toBeNull()
  })
})
