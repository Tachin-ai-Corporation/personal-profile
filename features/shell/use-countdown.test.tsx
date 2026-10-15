import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCountdown } from "./use-countdown"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe("useCountdown (F6-2)", () => {
  it("counts whole seconds from 60 down to 0, then calls onDone once", () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useCountdown({ onDone }))
    expect(result.current).toMatchObject({ remaining: 0, running: false })
    act(() => result.current.start(60))
    expect(result.current).toMatchObject({ remaining: 60, running: true })
    advance(1000)
    expect(result.current.remaining).toBe(59)
    advance(58_000)
    expect(result.current.remaining).toBe(1)
    expect(onDone).not.toHaveBeenCalled()
    advance(1000)
    expect(result.current).toMatchObject({ remaining: 0, running: false })
    expect(onDone).toHaveBeenCalledTimes(1)
    advance(5000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("reads the clock: a late timer never stretches the countdown", () => {
    const { result } = renderHook(() => useCountdown())
    act(() => result.current.start(30))
    // The clock jumps 20 s while no timer ran (a throttled background tab).
    vi.setSystemTime(Date.now() + 20_000)
    advance(250)
    expect(result.current.remaining).toBe(10)
  })

  it("restarts from a new value, rounds fractions up, and stops without onDone", () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useCountdown({ onDone }))
    act(() => result.current.start(60))
    advance(10_000)
    act(() => result.current.start(29.2))
    expect(result.current.remaining).toBe(30)
    act(() => result.current.stop())
    expect(result.current).toMatchObject({ remaining: 0, running: false })
    advance(60_000)
    expect(onDone).not.toHaveBeenCalled()
    act(() => result.current.start(-5))
    expect(result.current.remaining).toBe(0)
    advance(250)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("uses the latest onDone and clears its timer on unmount", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender, unmount } = renderHook(({ onDone }) => useCountdown({ onDone }), { initialProps: { onDone: first } })
    act(() => result.current.start(1))
    rerender({ onDone: second })
    advance(1000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    act(() => result.current.start(5))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
