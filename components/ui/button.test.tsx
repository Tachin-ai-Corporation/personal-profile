import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { Button } from "./button"

describe("Button", () => {
  it("uses the shared focus-ring and the 44 px touch size", () => {
    render(
      <Button type="button" size="touch">
        Save
      </Button>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    expect(button.className).toContain("focus-ring")
    expect(button.className).toContain("h-11")
    expect(button.getAttribute("aria-busy")).toBeNull()
    expect(button.getAttribute("aria-disabled")).toBeNull()
  })

  it("calls onClick when idle", () => {
    const onClick = vi.fn()
    render(
      <Button type="button" onClick={onClick}>
        Save
      </Button>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("while busy shows a spinner and the busy label, sets aria-busy and aria-disabled, and keeps focus", () => {
    const onClick = vi.fn()
    render(
      <Button type="button" busy busyLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole("button", { name: "Saving…" })
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.hasAttribute("disabled")).toBe(false)
    const spinner = button.querySelector("[data-slot='button-spinner']")
    expect(spinner?.getAttribute("aria-hidden")).toBe("true")
    expect(spinner?.getAttribute("class")).toContain("motion-reduce:animate-none")
    // Busy shows the progress cursor only (never the competing not-allowed rule).
    expect(button.className).toContain("cursor-progress")
    expect(button.className).not.toContain("cursor-not-allowed")
    button.focus()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button)
  })

  it("keeps the children as the label when no busyLabel is given", () => {
    render(
      <Button type="button" busy>
        Save
      </Button>,
    )
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBe("true")
  })

  it("runs one action for a double click that starts it (the second click lands while busy)", () => {
    const run = vi.fn()
    function Harness() {
      const [busy, setBusy] = useState(false)
      return (
        <Button
          type="button"
          busy={busy}
          onClick={() => {
            run()
            setBusy(true)
          }}
        >
          Save
        </Button>
      )
    }
    render(<Harness />)
    const button = screen.getByRole("button", { name: "Save" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(run).toHaveBeenCalledTimes(1)
    expect(button.getAttribute("aria-busy")).toBe("true")
  })

  it("does not submit its form while busy", () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy>
          Save
        </Button>
      </form>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("with asChild + busy renders the child without a spinner and suppresses the child's own onClick", () => {
    const childClick = vi.fn()
    render(
      <Button asChild busy>
        <a href="#x" onClick={childClick}>
          Go
        </a>
      </Button>,
    )
    const link = screen.getByRole("link", { name: "Go" })
    expect(link.querySelector("[data-slot='button-spinner']")).toBeNull()
    expect(link.getAttribute("aria-busy")).toBe("true")
    fireEvent.click(link)
    expect(childClick).not.toHaveBeenCalled()
  })

  it("with asChild and idle runs the child's onClick", () => {
    const childClick = vi.fn()
    render(
      <Button asChild>
        <a href="#x" onClick={childClick}>
          Go
        </a>
      </Button>,
    )
    fireEvent.click(screen.getByRole("link", { name: "Go" }))
    expect(childClick).toHaveBeenCalledTimes(1)
  })

  it.each([true, "true"] as const)("aria-disabled=%j is inert: no onClick, no submit, not-allowed cursor", (value) => {
    const onClick = vi.fn()
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" aria-disabled={value} onClick={onClick}>
          Save
        </Button>
      </form>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect(button.className).toContain("aria-disabled:cursor-not-allowed")
  })

  it("aria-disabled={false} stays active", () => {
    const onClick = vi.fn()
    render(
      <Button type="button" aria-disabled={false} onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole("button", { name: "Save" })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.getAttribute("aria-disabled")).toBeNull()
  })

  it("with a busyLabel, announces it through a polite status beside the button while busy", () => {
    const { rerender } = render(
      <Button type="button" busyLabel="Saving…">
        Save
      </Button>,
    )
    const status = screen.getByRole("status")
    expect(status.className).toContain("sr-only")
    expect(status.textContent).toBe("")
    expect(screen.getByRole("button").contains(status)).toBe(false)
    rerender(
      <Button type="button" busy busyLabel="Saving…">
        Save
      </Button>,
    )
    expect(screen.getByRole("status").textContent).toBe("Saving…")
    expect(screen.getByRole("button").textContent).toBe("Saving…")
  })

  it("renders no status region without a busyLabel", () => {
    render(
      <Button type="button" busy>
        Save
      </Button>,
    )
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("has no axe violations idle and busy", async () => {
    render(
      <main>
        <Button type="button">Save</Button>
        <Button type="button" variant="destructive" busy busyLabel="Removing…">
          Remove
        </Button>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
