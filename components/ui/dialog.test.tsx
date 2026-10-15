import { act, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Button } from "./button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from "./dialog"

beforeEach(() => stubLayoutApis())

/** Radix registers its outside-pointer listener one task after mount. */
const nextTask = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

function Harness(props: Partial<DialogContentProps> & { readonly withInitialFocus?: boolean }) {
  const { withInitialFocus, ...content } = props
  const [open, setOpen] = React.useState(true)
  const codeRef = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Open
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent {...content} initialFocus={withInitialFocus ? codeRef : undefined}>
          <DialogHeader>
            <DialogTitle>Link your Microsoft authenticator</DialogTitle>
            <DialogDescription>Scan the QR, then enter the code.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <button type="button">First</button>
            <label htmlFor="code">6-digit code</label>
            <input id="code" ref={codeRef} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const dialog = () => screen.getByRole("dialog", { name: "Link your Microsoft authenticator" })
const overlay = (): HTMLElement => document.querySelector<HTMLElement>("[data-slot='dialog-overlay']") as HTMLElement

describe("DialogContent (F6-2)", () => {
  it("is 440 px on the popover surface with rounded-lg, shadow-lg, the scrim and a catalog-named 44 px close button", async () => {
    render(<Harness />)
    const el = dialog()
    for (const token of ["max-w-[440px]", "bg-popover", "rounded-lg", "shadow-lg", "motion-reduce:animate-none"]) expect(el.className).toContain(token)
    expect(el.className).not.toContain("max-md:inset-0")
    expect(overlay().className).toContain("bg-scrim")
    const close = screen.getByRole("button", { name: "Close" })
    expect(close.className).toContain("size-11")
    expect(close.className).toContain("focus-ring")
    expect(await axeViolations()).toEqual([])
  })

  it("takes the lg size, a full-screen mobile variant and a custom close label", () => {
    render(<Harness size="lg" fullScreenOnMobile closeLabel="Close dialog" />)
    const el = dialog()
    expect(el.className).toContain("max-w-[640px]")
    expect(el.className).toContain("max-md:inset-0")
    expect(el.className).toContain("max-md:h-dvh")
    expect(el.getAttribute("data-fullscreen-mobile")).toBe("true")
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeTruthy()
    expect(document.querySelector("[data-slot='dialog-body']")?.className).toContain("overflow-y-auto")
  })

  it("leaves the close button out on request", () => {
    render(<Harness showCloseButton={false} />)
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull()
  })

  it("closes on Escape, the scrim and the close button while dismissible", async () => {
    render(<Harness />)
    fireEvent.keyDown(dialog(), { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    await nextTask()
    fireEvent.pointerDown(overlay())
    fireEvent.click(overlay())
    expect(screen.queryByRole("dialog")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("while not dismissible (busy) ignores Escape, the scrim and the close button", async () => {
    const onEscapeKeyDown = vi.fn()
    render(<Harness dismissible={false} onEscapeKeyDown={onEscapeKeyDown} />)
    await nextTask()
    expect(dialog().getAttribute("aria-busy")).toBe("true")
    fireEvent.keyDown(dialog(), { key: "Escape" })
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(overlay())
    fireEvent.click(overlay())
    const close = screen.getByRole("button", { name: "Close" })
    expect(close.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(close)
    expect(dialog()).toBeTruthy()
  })

  it("focuses the initialFocus element on open, else Radix's first focusable one", () => {
    const { unmount } = render(<Harness withInitialFocus />)
    expect(document.activeElement).toBe(screen.getByLabelText("6-digit code"))
    unmount()
    render(<Harness />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }))
  })

  it("returns focus on close to the element focused when it opened (no DialogTrigger needed)", async () => {
    function Opener({ onCloseAutoFocus }: { readonly onCloseAutoFocus?: (event: Event) => void }) {
      const [open, setOpen] = React.useState(false)
      const [showOpener, setShowOpener] = React.useState(true)
      return (
        <>
          {showOpener ? (
            <button type="button" onClick={() => setOpen(true)}>
              Opener
            </button>
          ) : null}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
              <DialogTitle>Picture</DialogTitle>
              <DialogDescription>Preview</DialogDescription>
              <button type="button" onClick={() => setShowOpener(false)}>
                Drop opener
              </button>
            </DialogContent>
          </Dialog>
        </>
      )
    }
    const { unmount } = render(<Opener />)
    const opener = screen.getByRole("button", { name: "Opener" })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await nextTask()
    expect(document.activeElement).toBe(opener)

    // An opener removed meanwhile is skipped.
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole("button", { name: "Drop opener" }))
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await nextTask()
    expect(screen.queryByRole("button", { name: "Opener" })).toBeNull()
    unmount()

    // A caller's own handler can take over.
    const custom = vi.fn((event: Event) => event.preventDefault())
    render(<Opener onCloseAutoFocus={custom} />)
    const second = screen.getByRole("button", { name: "Opener" })
    fireEvent.click(second)
    ;(document.body as HTMLElement).focus()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await nextTask()
    expect(custom).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(second)
  })

  it("lets a caller's onOpenAutoFocus decide first", () => {
    render(<Harness withInitialFocus onOpenAutoFocus={(event) => event.preventDefault()} />)
    expect(document.activeElement).not.toBe(screen.getByLabelText("6-digit code"))
  })
})
