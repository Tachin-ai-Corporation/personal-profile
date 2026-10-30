import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useConfirmationWindow } from "./use-confirmation-window"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const render = (event = 0) => renderHook(({ event }) => useConfirmationWindow(event, 100), { initialProps: { event } })

describe("useConfirmationWindow", () => {
  it("shows nothing at 0", () => {
    expect(render().result.current).toBe(false)
  })

  it("shows for `durationMs` after an event, then expires", () => {
    const { result, rerender } = render()
    rerender({ event: 1 })
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(99))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it("a newer event restarts the window; the older event's timer doesn't end it", () => {
    const { result, rerender } = render(1)
    act(() => vi.advanceTimersByTime(60))
    rerender({ event: 2 })
    act(() => vi.advanceTimersByTime(60))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(39))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it("a return to 0 hides it and forgets the past events: the next 1 shows again", () => {
    const { result, rerender } = render(1)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(false)
    rerender({ event: 0 })
    expect(result.current).toBe(false)
    rerender({ event: 1 })
    expect(result.current).toBe(true)
    // Dropping to 0 mid-window hides it at once.
    rerender({ event: 0 })
    expect(result.current).toBe(false)
  })

  it("clears its timer on unmount", () => {
    const { unmount } = render(1)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
