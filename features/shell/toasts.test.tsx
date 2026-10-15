import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Toaster } from "@/components/ui/toaster"
import { resetToasts, TOAST_LIMIT, TOAST_REMOVE_DELAY, useToast } from "@/hooks/use-toast"
import { axeViolations } from "@/test/axe"
import { PARTIAL_TOAST_MS, SUCCESS_TOAST_MS, toastError, toastPartial, toastSuccess } from "./toasts"

beforeEach(() => {
  vi.useFakeTimers()
  resetToasts()
  render(<Toaster />)
})

afterEach(() => {
  act(() => resetToasts())
  vi.useRealTimers()
})

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const toastFor = (text: string): HTMLElement | null => screen.queryByText(text, { selector: "[data-slot] *, li *" })?.closest("li") ?? null
/** The Retry action's click handler, called directly (a detached node's second click never reaches React). */
const retryOf = (toast: ReturnType<typeof useToast>["toasts"][number]): (() => void) => {
  const onClick = toast.action?.props.onClick
  if (!onClick) throw new Error("no Retry action")
  return () => onClick({} as Parameters<typeof onClick>[0])
}
const region = (): HTMLElement => screen.getByRole("region")
const viewport = (): HTMLElement => region().querySelector("ol") as HTMLElement

describe("toasts (features/shell/toasts.ts)", () => {
  it("toastSuccess: success-strong check icon on the popover surface (rounded-md, shadow-lg), gone after 5 s", () => {
    act(() => void toastSuccess("Phone saved."))
    const toast = toastFor("Phone saved.")
    expect(toast?.getAttribute("data-tone")).toBe("success")
    for (const name of ["bg-popover", "rounded-md", "shadow-lg", "motion-reduce:animate-none"]) expect(toast?.className).toContain(name)
    const icon = toast?.querySelector("[data-slot='toast-icon']")
    expect(icon?.getAttribute("class")).toContain("text-success-strong")
    expect(icon?.getAttribute("class")).toContain("lucide-circle-check")
    expect(SUCCESS_TOAST_MS).toBe(5000)

    advance(SUCCESS_TOAST_MS - 1)
    expect(toastFor("Phone saved.")?.getAttribute("data-state")).toBe("open")
    advance(1)
    expect(toastFor("Phone saved.")).toBeNull()
  })

  it("drops a closed toast from the queue once its exit animation ends (not after shadcn's 1 000 000 ms)", () => {
    expect(TOAST_REMOVE_DELAY).toBe(200)
    act(() => void toastSuccess("Phone saved."))
    expect(toastFor("Phone saved.")?.className).toContain("[animation-duration:200ms]")
    function QueueSize() {
      return <output data-testid="queue">{useToast().toasts.length}</output>
    }
    render(<QueueSize />)
    const queue = screen.getByTestId("queue")
    expect(queue.textContent).toBe("1")
    advance(SUCCESS_TOAST_MS + TOAST_REMOVE_DELAY - 1)
    expect(queue.textContent).toBe("1")
    advance(1)
    expect(queue.textContent).toBe("0")
  })

  it("announces politely (never assertive)", () => {
    act(() => void toastSuccess("Phone saved."))
    // Radix fills the announcer two animation frames later.
    advance(50)
    const announce = [...document.querySelectorAll("[aria-live]")].find((el) => el.textContent?.includes("Phone saved."))
    expect(announce?.getAttribute("aria-live")).toBe("polite")
    expect(document.querySelector("[aria-live='assertive']")).toBeNull()
  })

  it("pauses the 5 s timer while the pointer is over the toasts, and resumes on leave", () => {
    act(() => void toastSuccess("Phone saved."))
    fireEvent.pointerMove(region())
    advance(SUCCESS_TOAST_MS * 3)
    expect(toastFor("Phone saved.")?.getAttribute("data-state")).toBe("open")
    fireEvent.pointerLeave(region())
    advance(SUCCESS_TOAST_MS)
    expect(toastFor("Phone saved.")).toBeNull()
  })

  it("pauses the timer while focus is inside the toasts", () => {
    act(() => void toastSuccess("Phone saved."))
    act(() => screen.getByRole("button", { name: "Dismiss notification" }).focus())
    advance(SUCCESS_TOAST_MS * 3)
    expect(toastFor("Phone saved.")?.getAttribute("data-state")).toBe("open")
  })

  it("toastPartial: warning-strong alert icon, gone after 5 s", () => {
    act(() => void toastPartial("2 saved, 1 failed"))
    const icon = toastFor("2 saved, 1 failed")?.querySelector("[data-slot='toast-icon']")
    expect(icon?.getAttribute("class")).toContain("text-warning-strong")
    expect(icon?.getAttribute("class")).toContain("lucide-circle-alert")
    expect(PARTIAL_TOAST_MS).toBe(5000)
    advance(PARTIAL_TOAST_MS + TOAST_REMOVE_DELAY)
    expect(toastFor("2 saved, 1 failed")).toBeNull()
  })

  it("toastError: error-strong icon and a Retry action; persists until Retry, which calls onRetry once and closes it", () => {
    const onRetry = vi.fn()
    act(() => void toastError("Couldn't save phone. Check your connection.", { onRetry }))
    const toast = toastFor("Couldn't save phone. Check your connection.")
    expect(toast?.querySelector("[data-slot='toast-icon']")?.getAttribute("class")).toContain("text-error-strong")
    advance(60_000)
    expect(toastFor("Couldn't save phone. Check your connection.")?.getAttribute("data-state")).toBe("open")

    const retry = screen.getByRole("button", { name: "Retry" })
    expect(retry.className).toContain("h-11")
    expect(retry.className).toContain("focus-ring")
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    advance(TOAST_REMOVE_DELAY)
    expect(toastFor("Couldn't save phone. Check your connection.")).toBeNull()
  })

  it("toastError is dismissed by its 44 px close button, without retrying", () => {
    const onRetry = vi.fn()
    act(() => void toastError("Couldn't save phone.", { onRetry }))
    const close = screen.getByRole("button", { name: "Dismiss notification" })
    expect(close.className).toContain("size-11")
    fireEvent.click(close)
    advance(TOAST_REMOVE_DELAY)
    expect(toastFor("Couldn't save phone.")).toBeNull()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("dismiss() closes a toast early", () => {
    let shown: ReturnType<typeof toastSuccess> | undefined
    act(() => void (shown = toastSuccess("Email saved.")))
    act(() => shown?.dismiss())
    advance(TOAST_REMOVE_DELAY)
    expect(toastFor("Email saved.")).toBeNull()
  })

  it("shows three toasts at once; a fourth drops the oldest", () => {
    expect(TOAST_LIMIT).toBe(3)
    act(() => {
      toastSuccess("Phone saved.")
      toastSuccess("Email saved.")
      toastError("Couldn't save addresses.", { onRetry: vi.fn() })
    })
    for (const text of ["Phone saved.", "Email saved.", "Couldn't save addresses."]) expect(toastFor(text)).not.toBeNull()
    act(() => void toastPartial("2 saved, 1 failed"))
    expect(toastFor("Phone saved.")).toBeNull()
    for (const text of ["Email saved.", "Couldn't save addresses.", "2 saved, 1 failed"]) expect(toastFor(text)).not.toBeNull()
  })

  it("never drops an error toast for the limit: the oldest non-error toasts go first", () => {
    act(() => {
      toastError("Couldn't save phone.", { onRetry: vi.fn() })
      toastSuccess("Email saved.")
      toastSuccess("Addresses saved.")
      toastSuccess("Social media saved.")
    })
    for (const text of ["Couldn't save phone.", "Addresses saved.", "Social media saved."]) expect(toastFor(text)).not.toBeNull()
    expect(toastFor("Email saved.")).toBeNull()
  })

  it("lets error toasts exceed the limit when every queued toast is an error", () => {
    act(() => {
      for (const n of [1, 2, 3, 4]) toastError(`Couldn't save ${n}.`, { onRetry: vi.fn() })
    })
    for (const n of [1, 2, 3, 4]) expect(toastFor(`Couldn't save ${n}.`)).not.toBeNull()
  })

  it("clears the pending removal of a toast evicted by the limit", () => {
    // Without the renderer, the only timers are the queue's removal timeouts.
    cleanup()
    act(() => toastSuccess("Phone saved.").dismiss())
    expect(vi.getTimerCount()).toBe(1)
    act(() => {
      toastSuccess("Email saved.")
      toastSuccess("Addresses saved.")
      toastSuccess("Social media saved.")
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("Retry runs onRetry once per toast (a second click during the exit does nothing)", () => {
    let toasts: ReturnType<typeof useToast>["toasts"] = []
    function Probe() {
      toasts = useToast().toasts
      return null
    }
    render(<Probe />)
    const onRetry = vi.fn()
    act(() => void toastError("Couldn't save phone.", { onRetry }))
    const click = retryOf(toasts[0])
    act(() => {
      click()
      click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(toasts[0].open).toBe(false)
  })

  it("Retry closes the toast even when onRetry throws", () => {
    let toasts: ReturnType<typeof useToast>["toasts"] = []
    function Probe() {
      toasts = useToast().toasts
      return null
    }
    render(<Probe />)
    act(() =>
      void toastError("Couldn't save phone.", {
        onRetry: () => {
          throw new Error("boom")
        },
      }),
    )
    const click = retryOf(toasts[0])
    let thrown: unknown
    act(() => {
      try {
        click()
      } catch (error) {
        thrown = error
      }
    })
    expect(thrown).toEqual(new Error("boom"))
    expect(toasts[0].open).toBe(false)
  })

  it("places the viewport bottom-center on mobile and bottom-right from 768 px, raised by --toast-bottom-offset", () => {
    act(() => void toastSuccess("Phone saved."))
    const className = viewport().className
    for (const name of ["fixed", "bottom-[var(--toast-bottom-offset)]", "left-1/2", "-translate-x-1/2", "md:right-0", "md:left-auto", "md:translate-x-0"]) {
      expect(className).toContain(name)
    }
  })

  it("has no axe violations with all three tones", async () => {
    act(() => {
      toastSuccess("Phone saved.")
      toastPartial("2 saved, 1 failed")
      toastError("Couldn't save phone. Check your connection.", { onRetry: vi.fn() })
    })
    vi.useRealTimers()
    expect(await axeViolations()).toEqual([])
  })
})
