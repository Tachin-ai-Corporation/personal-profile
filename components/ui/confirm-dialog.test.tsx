import { act, fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog"

type Props = Partial<ConfirmDialogProps>

function setup(props: Props = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <ConfirmDialog
      open
      title="Remove your signature?"
      body="Documents you sign will no longer carry it."
      confirmLabel="Remove signature"
      variant="standard"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onConfirm, onCancel, ...view }
}

/** Radix registers its outside-pointer listener one task after mount. */
const nextTask = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

const overlay = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>("[data-slot='dialog-overlay']")
  if (!el) throw new Error("no overlay")
  return el
}

/** Radix defers the outside-pointer dismissal to the click that follows the press. */
function clickOverlay(): void {
  fireEvent.pointerDown(overlay())
  fireEvent.click(overlay())
}

async function axeViolations(): Promise<axe.Result[]> {
  // jsdom has no layout or stylesheet, so contrast is checked by the token values (app/globals.test.ts).
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
  return results.violations
}

afterEach(() => document.documentElement.classList.remove("dark"))

describe("ConfirmDialog", () => {
  it("is an alertdialog labelled by its title and described by its body, over the scrim", () => {
    setup()
    const dialog = screen.getByRole("alertdialog", { name: "Remove your signature?" })
    const describedBy = dialog.getAttribute("aria-describedby") ?? ""
    expect(document.getElementById(describedBy)?.textContent).toBe("Documents you sign will no longer carry it.")
    expect(dialog.className).toContain("rounded-lg")
    expect(dialog.className).toContain("shadow-lg")
    expect(dialog.className).toContain("motion-reduce:animate-none")
    expect(overlay().className).toContain("bg-scrim")
    expect(overlay().className).not.toContain("bg-black")
    expect(overlay().className).toContain("motion-reduce:animate-none")
    expect(dialog.className).toContain("data-[state=closed]:animate-out")
  })

  it("orders Cancel → confirm with a primary fill for the standard variant, and focuses Cancel", () => {
    setup()
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Cancel", "Remove signature"])
    expect(document.activeElement).toBe(buttons[0])
    expect(buttons[1].className).toContain("bg-primary")
    expect(buttons[0].className).toContain("h-11")
  })

  it("fills the destructive confirm with destructive-fill", () => {
    setup({ variant: "destructive" })
    const confirm = screen.getByRole("button", { name: "Remove signature" })
    expect(confirm.className).toContain("bg-destructive-fill")
    expect(confirm.className).toContain("text-destructive-foreground")
  })

  it("renders the extra action as an outline button between Cancel and confirm", () => {
    const onDiscard = vi.fn()
    setup({ cancelLabel: "Keep editing", confirmLabel: "Save", extraAction: { label: "Discard", onClick: onDiscard } })
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Keep editing", "Discard", "Save"])
    expect(buttons[1].className).toContain("border")
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.click(buttons[1])
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it("calls onConfirm from the confirm button and onCancel from Cancel", () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Remove signature" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("treats Escape and an overlay click exactly like Cancel", async () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    expect(onCancel).toHaveBeenCalledTimes(1)
    await nextTask()
    clickOverlay()
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("while busy shows a spinner and ignores Cancel, Escape, overlay, extra action and confirm", async () => {
    const onDiscard = vi.fn()
    const { onConfirm, onCancel } = setup({ busy: true, extraAction: { label: "Discard", onClick: onDiscard } })
    const dialog = screen.getByRole("alertdialog")
    expect(dialog.getAttribute("aria-busy")).toBe("true")
    // The confirm button is the busy Button (spinner, "Saving…", aria-busy); Cancel and the extra action are only aria-disabled.
    const confirm = screen.getByRole("button", { name: "Saving…" })
    expect(confirm.getAttribute("aria-busy")).toBe("true")
    expect(confirm.querySelector("svg.animate-spin")).not.toBeNull()
    expect(dialog.querySelectorAll("svg.animate-spin")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-busy")).toBeNull()
    confirm.focus()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.keyDown(dialog, { key: "Escape" })
    await nextTask()
    clickOverlay()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    fireEvent.click(confirm)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeNull()
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("aria-disabled")).toBe("true")
      expect(button.className).toContain("aria-disabled:opacity-50")
      expect(button.className).toContain(button === confirm ? "cursor-progress" : "aria-disabled:cursor-not-allowed")
    }
    // One status region (the busy Button's), no duplicate from the dialog.
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status").textContent).toBe("Saving…")
    expect(document.activeElement).toBe(confirm)
  })

  it("announces nothing busy while idle", () => {
    setup()
    expect(screen.getByRole("status").textContent).toBe("")
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("aria-disabled")).toBeNull()
  })

  it("renders the body in a div so block content nests validly", () => {
    setup({
      body: (
        <ul>
          <li>First</li>
        </ul>
      ),
    })
    const dialog = screen.getByRole("alertdialog")
    const description = document.getElementById(dialog.getAttribute("aria-describedby") ?? "")
    expect(description?.tagName).toBe("DIV")
    expect(description?.querySelector("ul > li")?.textContent).toBe("First")
  })

  it("does not focus a trigger that was removed while it was open", async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          {open ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Remove
            </button>
          )}
          <ConfirmDialog
            open={open}
            title="Remove your signature?"
            body="Documents you sign will no longer carry it."
            confirmLabel="Remove signature"
            variant="destructive"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)
    const removed = screen.getByRole("button", { name: "Remove" })
    removed.focus()
    fireEvent.click(removed)
    expect(removed.isConnected).toBe(false)
    const focusSpy = vi.spyOn(removed, "focus")
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    await nextTask()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(focusSpy).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(removed)
  })

  it("returns focus to the element that opened it", async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Remove
          </button>
          <ConfirmDialog
            open={open}
            title="Remove your signature?"
            body="Documents you sign will no longer carry it."
            confirmLabel="Remove signature"
            variant="destructive"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole("button", { name: "Remove" })
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    await nextTask()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("leaves the confirm button out when showConfirm is false", () => {
    setup({ showConfirm: false, cancelLabel: "Keep editing", extraAction: { label: "Discard", onClick: vi.fn() } })
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Keep editing", "Discard"])
  })

  it("lets onCloseFocus move focus instead of the trigger", async () => {
    const target = { current: null as HTMLInputElement | null }
    function Harness({ claim }: { claim: boolean }) {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Leave
          </button>
          <input aria-label="First name" ref={(el) => void (target.current = el)} />
          <ConfirmDialog
            open={open}
            title="You have unsaved changes"
            body="Body"
            confirmLabel="Save"
            variant="standard"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
            onCloseFocus={() => {
              if (!claim) return false
              target.current?.focus()
              return true
            }}
          />
        </>
      )
    }
    const { unmount } = render(<Harness claim />)
    const trigger = screen.getByRole("button", { name: "Leave" })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await nextTask()
    expect(document.activeElement).toBe(target.current)
    unmount()

    render(<Harness claim={false} />)
    const again = screen.getByRole("button", { name: "Leave" })
    again.focus()
    fireEvent.click(again)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await nextTask()
    expect(document.activeElement).toBe(again)
  })

  it.each(["light", "dark"])("has no axe violations in %s mode, for both variants", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const { unmount } = setup({ variant: "standard", extraAction: { label: "Discard", onClick: vi.fn() } })
    expect(await axeViolations()).toEqual([])
    unmount()
    setup({ variant: "destructive", busy: true })
    expect(await axeViolations()).toEqual([])
  })
})
