"use client"

import * as React from "react"

/**
 * Whether the confirmation of the latest event shows (design refresh: the
 * copy ✓, the saved check, the saved ring). `event` counts the events: each
 * increase opens a `durationMs` window, a newer event restarts it, and an
 * older event's timer never ends a newer one's confirmation. `0` shows none,
 * and a return to `0` forgets the past events, so a counter that starts over
 * confirms its next event again. Timers are cleared on unmount.
 */
export function useConfirmationWindow(event: number, durationMs: number): boolean {
  // The event whose window has ended.
  const [doneFor, setDoneFor] = React.useState(0)
  if (event === 0 && doneFor !== 0) setDoneFor(0)
  React.useEffect(() => {
    if (event === 0) return
    const timer = setTimeout(() => setDoneFor(event), durationMs)
    return () => clearTimeout(timer)
  }, [event, durationMs])
  return event > 0 && doneFor !== event
}
