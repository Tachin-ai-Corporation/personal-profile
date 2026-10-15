import { act, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { Button } from "./button"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "./sheet"

beforeEach(() => stubLayoutApis())

const nextTask = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

function Harness({ dismissible = true, onClose = vi.fn() }: { readonly dismissible?: boolean; readonly onClose?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const insurerRef = React.useRef<HTMLInputElement>(null)
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
        setOpen(next)
      }}
    >
      <SheetTrigger asChild>
        <Button type="button">Add insurance</Button>
      </SheetTrigger>
      <SheetContent dismissible={dismissible} initialFocus={insurerRef}>
        <SheetHeader>
          <SheetTitle>Add insurance</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <SheetDescription>Policy details</SheetDescription>
          <label htmlFor="insurer">Insurer</label>
          <input id="insurer" ref={insurerRef} />
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" size="touch">
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Add insurance" }))
const sheet = () => screen.getByRole("dialog", { name: "Add insurance" })

describe("Sheet (F6-2)", () => {
  it("opens from the right, 480 px, full height, card surface, shadow-lg, over the scrim; focus goes to initialFocus", async () => {
    render(<Harness />)
    open()
    const el = sheet()
    for (const token of ["right-0", "inset-y-0", "md:max-w-[480px]", "h-dvh", "bg-card", "shadow-lg", "slide-in-from-right", "motion-reduce:animate-none"]) {
      expect(el.className).toContain(token)
    }
    expect(document.querySelector("[data-slot='dialog-overlay']")?.className).toContain("bg-scrim")
    expect(document.activeElement).toBe(screen.getByLabelText("Insurer"))
    expect(document.querySelector("[data-slot='sheet-header']")?.className).toContain("min-h-[60px]")
    expect(document.querySelector("[data-slot='sheet-body']")?.className).toContain("overflow-y-auto")
    expect(document.querySelector("[data-slot='sheet-footer']")?.className).toContain("border-t")
    expect(await axeViolations()).toEqual([])
  })

  it("has a desktop close and a mobile back control (CSS picks one), both 44 px and named from the catalog", () => {
    render(<Harness />)
    open()
    const close = screen.getByRole("button", { name: "Close" })
    const back = screen.getByRole("button", { name: "Back" })
    expect(close.className).toContain("max-md:hidden")
    expect(back.className).toContain("md:hidden")
    for (const button of [close, back]) expect(button.className).toContain("size-11")
  })

  it("asks to close (onOpenChange(false)) on close, back and Escape", () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    open()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    open()
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    open()
    fireEvent.keyDown(sheet(), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("while not dismissible ignores close, back, Escape and the scrim", async () => {
    const onClose = vi.fn()
    render(<Harness dismissible={false} onClose={onClose} />)
    open()
    await nextTask()
    expect(sheet().getAttribute("aria-busy")).toBe("true")
    for (const name of ["Close", "Back"]) {
      const button = screen.getByRole("button", { name })
      expect(button.getAttribute("aria-disabled")).toBe("true")
      fireEvent.click(button)
    }
    fireEvent.keyDown(sheet(), { key: "Escape" })
    const overlay = document.querySelector<HTMLElement>("[data-slot='dialog-overlay']") as HTMLElement
    fireEvent.pointerDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).not.toHaveBeenCalled()
    expect(sheet()).toBeTruthy()
  })
})
