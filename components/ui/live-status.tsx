"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/** A no-break space: appended to repeat an identical message so screen readers hear it again. */
const REPEAT_MARK = " "

export interface Announcer {
  /** What the region holds now (render it with `LiveStatus`). */
  readonly message: string
  /** Announce `text` politely; the same text again is announced again. */
  readonly announce: (text: string) => void
  /** Empty the region (e.g. when the thing announced goes away). */
  readonly clear: () => void
}

/**
 * A polite announcer (F6-2): `announce("Link sent")` updates the message;
 * announcing the same text twice changes it by a trailing no-break space,
 * so the live region changes and is read again (the F5-2 combobox rule).
 */
export function useAnnounce({ clearAfterMs }: { readonly clearAfterMs?: number } = {}): Announcer {
  const [message, setMessage] = React.useState("")
  const announce = React.useCallback((text: string) => {
    setMessage((current) => (current === text ? `${text}${REPEAT_MARK}` : text))
  }, [])
  const clear = React.useCallback(() => setMessage(""), [])
  // Optional auto-clear, so a stale message isn't read again when the user browses to the region.
  React.useEffect(() => {
    if (clearAfterMs === undefined || message === "") return
    const timer = setTimeout(() => setMessage(""), clearAfterMs)
    return () => clearTimeout(timer)
  }, [clearAfterMs, message])
  return { message, announce, clear }
}

export interface LiveStatusProps {
  readonly message: string
  /** Shown on screen (e.g. a status line) instead of visually hidden. */
  readonly visible?: boolean
  readonly className?: string
}

/** The polite `role="status"` region; always rendered, so a change is heard. */
export function LiveStatus({ message, visible = false, className }: LiveStatusProps): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-slot="live-status" className={cn(!visible && "sr-only", className)}>
      {message}
    </div>
  )
}
