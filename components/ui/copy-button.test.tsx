import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { COPY_CONFIRM_MS, CopyButton } from "./copy-button"

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
})
afterEach(() => vi.useRealTimers())

const button = () => screen.getByRole("button", { name: "Copy +1 (415) 555-2671" })
const status = () => document.querySelector<HTMLElement>("[data-slot='copy-status']")
const confirmation = () => document.querySelector<HTMLElement>("[data-slot='copy-confirmation']")

/** Clicks and lets the clipboard promise settle. */
async function click(): Promise<void> {
  await act(async () => {
    fireEvent.click(button())
    await Promise.resolve()
  })
}

describe("CopyButton (design refresh)", () => {
  it("is a named icon button, hidden until its row is hovered or keyboard-focused, always shown without hover", () => {
    render(<CopyButton value="+1 (415) 555-2671" />)
    const classes = button().className
    expect(button().getAttribute("type")).toBe("button")
    for (const name of ["opacity-0", "group-hover/row:opacity-100", "group-has-[:focus-visible]/row:opacity-100", "focus-visible:opacity-100", "[@media(hover:none)]:opacity-100", "focus-ring"])
      expect(classes).toContain(name)
    // A 28 px icon with a 44 × 44 hit area.
    expect(classes).toContain("size-7")
    expect(classes).toContain("after:-inset-2")
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("lucide-copy")
    expect(status()?.getAttribute("role")).toBe("status")
    expect(status()?.textContent).toBe("")
  })

  it("names and announces by `label` when given", async () => {
    render(<CopyButton value="ann@example.com" label="Ann's email" />)
    const named = screen.getByRole("button", { name: "Copy Ann's email" })
    await act(async () => {
      fireEvent.click(named)
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith("ann@example.com")
    expect(status()?.textContent).toBe("Ann's email copied")
  })

  it("copies the value, shows ✓ and a decorative \"Copied\", announces it, then reverts; a second copy restarts the timer", async () => {
    vi.useFakeTimers()
    render(<CopyButton value="+1 (415) 555-2671" />)
    await click()
    expect(writeText).toHaveBeenCalledWith("+1 (415) 555-2671")
    expect(button().dataset.copied).toBe("true")
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("lucide-check")
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("animate-icon-pop")
    expect(confirmation()?.textContent).toBe("Copied")
    expect(confirmation()?.getAttribute("aria-hidden")).toBe("true")
    expect(status()?.textContent).toBe("+1 (415) 555-2671 copied")
    act(() => vi.advanceTimersByTime(COPY_CONFIRM_MS - 1))
    await click()
    act(() => vi.advanceTimersByTime(COPY_CONFIRM_MS - 1))
    expect(confirmation()).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(confirmation()).toBeNull()
    expect(button().hasAttribute("data-copied")).toBe(false)
    expect(button().querySelector("svg")?.getAttribute("class")).toContain("lucide-copy")
  })

  it("when the clipboard refuses: no ✓, and it announces how to copy by hand", async () => {
    writeText.mockRejectedValue(new Error("denied"))
    render(<CopyButton value="+1 (415) 555-2671" />)
    await click()
    await act(async () => {
      await Promise.resolve()
    })
    expect(confirmation()).toBeNull()
    expect(button().hasAttribute("data-copied")).toBe(false)
    expect(status()?.textContent).toBe("Couldn't copy +1 (415) 555-2671. Select it to copy it yourself.")
  })

  it("without a clipboard API (an insecure page): announces the same fallback", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
    render(<CopyButton value="+1 (415) 555-2671" />)
    await click()
    expect(status()?.textContent).toBe("Couldn't copy +1 (415) 555-2671. Select it to copy it yourself.")
  })

  it("has no axe violations, before and after a copy", async () => {
    render(
      <main>
        <CopyButton value="+1 (415) 555-2671" />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
    await click()
    expect(await axeViolations()).toEqual([])
  })
})
