"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { callApi, lastActivityAt, subscribe, subscribeActivity } from "@/lib/api"
import { publish } from "@/lib/api/session-events"
import { IDLE_COPY } from "@/lib/shared/messages"

/**
 * =============================================================================
 * Idle warning (AD-16, Story 1.6)
 * =============================================================================
 *
 * Mirrors the server's idle and absolute limits on the client:
 *   - `lastActivity` = max(page `lastSeen`, `lastActivityAt()`); activity from
 *     any tab (echoed `X-PP-Activity-At`, shared over `pp-activity`) moves it.
 *   - At `lastActivity + idle − 60 s` a non-dismissable `alertdialog` offers
 *     "Stay signed in", which pings `POST /api/session/ping`.
 *   - At `lastActivity + idle`, or `absoluteExpiresAt`, whichever comes first,
 *     it closes the dialog, publishes `session-expired` and stops.
 *
 * Every deadline is evaluated in SERVER time (`offset = serverNow − Date.now()`,
 * computed once), on a short tick, on `visibilitychange` and on `focus`, so a
 * throttled background tab still fires on time.
 *
 * Once `session-expired` or `session-changed` is published (by any caller) the
 * warning stops for good: it closes, clears its timer and never opens or
 * publishes again. While a "Stay signed in" ping is in flight the deadline does
 * not publish; the ping's outcome decides.
 * =============================================================================
 */

/** The warning opens this long before the idle deadline. */
const WARNING_LEAD_MS = 60_000

/** Re-evaluate at least this often while running. */
const TICK_MS = 1_000

export interface IdleWarningProps {
  /** Server idle limit in seconds (900). */
  idleTimeoutSec: number
  /** The session's `lastSeen` when the page rendered (epoch ms, server time). */
  lastSeen: number
  /** `iat + ABSOLUTE_TIMEOUT_MS` (epoch ms, server time). */
  absoluteExpiresAt: number
  /** The server's `Date.now()` when the page rendered. */
  serverNow: number
}

export function IdleWarning({ idleTimeoutSec, lastSeen, absoluteExpiresAt, serverNow }: IdleWarningProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const offsetRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingingRef = useRef(false)
  const evaluateRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (offsetRef.current === null) offsetRef.current = serverNow - Date.now()
    const idleMs = idleTimeoutSec * 1000

    const clearTimer = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const evaluate = () => {
      if (stoppedRef.current) return
      clearTimer()
      const now = Date.now() + (offsetRef.current ?? 0)
      const lastActivity = Math.max(lastSeen, lastActivityAt())
      const idleDeadline = lastActivity + idleMs
      const deadline = Math.min(idleDeadline, absoluteExpiresAt)
      if (now >= deadline) {
        // A pending ping may have been accepted: let its outcome decide.
        if (pingingRef.current) return
        stoppedRef.current = true
        setOpen(false)
        publish("session-expired")
        return
      }
      const warnAt = idleDeadline - WARNING_LEAD_MS
      setOpen(now >= warnAt)
      const next = now < warnAt ? warnAt : deadline
      timerRef.current = setTimeout(evaluate, Math.max(0, Math.min(next - now, TICK_MS)))
    }
    evaluateRef.current = evaluate

    const stop = () => {
      stoppedRef.current = true
      clearTimer()
      setOpen(false)
    }

    const onVisibility = () => evaluate()
    const unsubscribe = subscribeActivity(() => evaluate())
    const unsubscribeExpired = subscribe("session-expired", stop)
    const unsubscribeChanged = subscribe("session-changed", stop)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onVisibility)
    evaluate()

    return () => {
      clearTimer()
      unsubscribe()
      unsubscribeExpired()
      unsubscribeChanged()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onVisibility)
    }
  }, [idleTimeoutSec, lastSeen, absoluteExpiresAt, serverNow])

  const stay = useCallback(async () => {
    if (busy || stoppedRef.current) return
    setBusy(true)
    pingingRef.current = true
    const res = await callApi("session/ping", "/api/session/ping", { method: "POST" })
    pingingRef.current = false
    if (stoppedRef.current) {
      // A session event (e.g. SESSION_EXPIRED / SESSION_CHANGED from this ping) ended it.
      setOpen(false)
      setBusy(false)
      return
    }
    if (res.success) {
      // `callApi` already noted the echoed `X-PP-Activity-At`; re-evaluate from it.
      setOpen(false)
      setBusy(false)
      evaluateRef.current()
      return
    }
    // Any other failure: stay open with the button enabled again, and catch up
    // on a deadline that passed while the ping was pending.
    setBusy(false)
    evaluateRef.current()
  }, [busy])

  // Return focus to the button once it is enabled again after a failed ping.
  useEffect(() => {
    if (open && !busy) buttonRef.current?.focus()
  }, [open, busy])

  return (
    <Dialog open={open}>
      <DialogContent
        role="alertdialog"
        aria-describedby={undefined}
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          buttonRef.current?.focus()
        }}
      >
        <DialogTitle>{IDLE_COPY.title}</DialogTitle>
        <div className="flex justify-end">
          <Button
            ref={buttonRef}
            type="button"
            className="min-h-11 focus:border-ring focus:ring-[3px] focus:ring-ring/50"
            disabled={busy}
            onClick={stay}
          >
            {IDLE_COPY.stay}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
