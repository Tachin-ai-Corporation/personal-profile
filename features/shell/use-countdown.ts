"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** How often the countdown re-reads the clock. Short enough that a second never shows twice as long. */
const TICK_MS = 250

export interface UseCountdownOptions {
  /** Called once when a started countdown reaches 0 (not on `stop()` or unmount). */
  readonly onDone?: () => void
}

export interface Countdown {
  /** Whole seconds left, rounded up (60 … 1), and 0 when idle or done. */
  readonly remaining: number
  readonly running: boolean
  /** Starts (or restarts) the countdown from `seconds`. */
  readonly start: (seconds: number) => void
  /** Stops it; `remaining` goes to 0 and `onDone` is not called. */
  readonly stop: () => void
}

/**
 * A seconds countdown to a deadline (F6-2): the 60 s "Resend in {n} s" of
 * verify links (Stories 3.3, 3.6) and the 30 s SSN auto-hide (Story 2.3).
 * It reads the clock on every tick, so a slow or throttled timer never
 * stretches it. It is only numbers: a reduced-motion ring or text is the
 * caller's choice. State lives in the component only (a reload forgets it).
 */
export function useCountdown({ onDone }: UseCountdownOptions = {}): Countdown {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    if (deadline === null) return
    const tick = (): void => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) {
        setDeadline(null)
        onDoneRef.current?.()
      }
    }
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const whole = Math.max(0, Math.ceil(seconds))
    setRemaining(whole)
    setDeadline(Date.now() + whole * 1000)
  }, [])

  const stop = useCallback(() => {
    setDeadline(null)
    setRemaining(0)
  }, [])

  return { remaining, running: deadline !== null, start, stop }
}
