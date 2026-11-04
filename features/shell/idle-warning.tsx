"use client"

import { Hourglass } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { activity, recordUserActivity, sessionEvents } from "@/lib/api"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"
import { formatMessage, IDLE_MESSAGES } from "@/lib/shared/messages"
import { useNavigate } from "./navigate"

/** The warning opens this long before the (client) idle deadline. */
export const IDLE_WARNING_LEAD_MS = 60_000

/**
 * Both client deadlines fire this much before the server's. The clock offset is
 * taken when the component mounts, so render/hydration latency (and a cached
 * RSC payload's older `serverNow`/`lastSeen`) make the client run late; the
 * margin keeps the client ahead of the server, so the user is warned and
 * signed out by the page, never surprised by a 401 first.
 */
export const IDLE_SAFETY_MARGIN_MS = 30_000

/** A "Stay signed in" ping is abandoned after this long, so expiry can't hang on it. */
export const IDLE_PING_TIMEOUT_MS = 10_000

/** Re-evaluate at least this often while running. */
const TICK_MS = 1_000

const preventDismiss = (event: Event): void => event.preventDefault()

/** The countdown's milestones read out by the status region (the visible timer itself is not live). */
const ANNOUNCED_SECONDS = [30, 10] as const

/** `m:ss`, e.g. `0:59`. */
export function formatIdleCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** The status line for `seconds` left: the latest milestone passed (30 s, then 10 s), else nothing. */
export function idleMilestone(seconds: number): string {
  const milestone = ANNOUNCED_SECONDS.filter((mark) => seconds <= mark).at(-1)
  return milestone === undefined ? "" : formatMessage(IDLE_MESSAGES.remaining, { seconds: milestone })
}

export type IdleWarningProps = PageIdleTiming

/**
 * The idle warning (Story 1.6, AD-16), mounted once by `PageFrame`.
 *
 * - `lastActivity` is the larger of the page's `lastSeen` and
 *   `activity.lastAt()`; activity from any tab (an echoed `X-PP-Activity-At`,
 *   shared over `pp-activity`) moves it.
 * - Client deadlines are the server's minus `IDLE_SAFETY_MARGIN_MS`.
 * - 60 s before the idle deadline an `alertdialog` ("Still there?") counts
 *   down to the deadline and offers "Stay signed in", which pings
 *   `POST /api/session/ping` (≤ 10 s; also on Escape), and "Sign out now",
 *   the app's portal exit (leave guard, logout, 1health). A press outside
 *   does nothing. The visible `m:ss` timer is not live; a status line reads
 *   the 30 s and 10 s marks (and "Keeping you signed in…" while pinging).
 * - At `min(idle deadline, absolute deadline)` it closes and publishes
 *   `session-expired` (the leave guard settles and the session dialog opens),
 *   unless a ping is in flight: then the ping's outcome decides.
 * - Deadlines are in server time (`offset = serverNow − Date.now()`, computed
 *   once) and re-evaluated on a tick, on activity, `visibilitychange` and
 *   `focus`, so a throttled background tab still fires on time.
 * - Once `session-expired` was published, by anyone, it stops for good.
 */
export function IdleWarning({ idleTimeoutSec, lastSeen, absoluteExpiresAt, serverNow }: IdleWarningProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Whole seconds to the deadline, for display only (set by `evaluate`, which ticks every second while open). */
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const navigate = useNavigate()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const offsetRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)
  const pingingRef = useRef(false)
  /** The live effect's `evaluate`, or `null` once unmounted (a late ping then does nothing). */
  const evaluateRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    offsetRef.current ??= serverNow - Date.now()
    const offset = offsetRef.current
    const idleMs = idleTimeoutSec * 1000
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = (): void => {
      stoppedRef.current = true
      clearTimeout(timer)
      setOpen(false)
    }

    const evaluate = (): void => {
      if (stoppedRef.current) return
      clearTimeout(timer)
      const now = Date.now() + offset
      const idleDeadline = Math.max(lastSeen, activity.lastAt()) + idleMs - IDLE_SAFETY_MARGIN_MS
      const deadline = Math.min(idleDeadline, absoluteExpiresAt - IDLE_SAFETY_MARGIN_MS)
      if (now >= deadline) {
        // A pending ping may have been accepted: its outcome decides.
        if (pingingRef.current) return
        stop()
        sessionEvents.publish("session-expired")
        return
      }
      const warnAt = idleDeadline - IDLE_WARNING_LEAD_MS
      setOpen(now >= warnAt)
      setSecondsLeft(Math.ceil((deadline - now) / 1000))
      const next = now < warnAt ? Math.min(warnAt, deadline) : deadline
      timer = setTimeout(evaluate, Math.min(next - now, TICK_MS))
    }
    evaluateRef.current = evaluate

    if (sessionEvents.hasPublished("session-expired")) stop()
    const offExpired = sessionEvents.subscribe("session-expired", stop)
    const offActivity = activity.subscribe(evaluate)
    document.addEventListener("visibilitychange", evaluate)
    window.addEventListener("focus", evaluate)
    evaluate()

    return () => {
      evaluateRef.current = null
      clearTimeout(timer)
      offExpired()
      offActivity()
      document.removeEventListener("visibilitychange", evaluate)
      window.removeEventListener("focus", evaluate)
    }
  }, [idleTimeoutSec, lastSeen, absoluteExpiresAt, serverNow])

  async function stay(): Promise<void> {
    if (pingingRef.current || stoppedRef.current) return
    pingingRef.current = true
    setBusy(true)
    const startedAt = Date.now() + (offsetRef.current ?? 0)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), IDLE_PING_TIMEOUT_MS)
    try {
      // A 204 echoes `X-PP-Activity-At`, which `callApi` notes: the activity
      // subscription then closes the dialog. A 401 publishes `session-expired`.
      const result = await recordUserActivity({ signal: controller.signal })
      // A 204 without a usable echo: the server re-sealed no earlier than the ping started.
      if (result.success && evaluateRef.current && activity.lastAt() < startedAt) activity.note(startedAt)
    } finally {
      clearTimeout(timeout)
      pingingRef.current = false
      setBusy(false)
    }
    // Catch up on a deadline that passed while the ping was pending; any other
    // failure leaves the dialog open. Nothing runs once unmounted.
    evaluateRef.current?.()
  }

  /** "Sign out now": the portal exit every page uses (Return to 1health); a cancelled leave guard keeps the warning. */
  async function signOut(): Promise<void> {
    if (signingOut || pingingRef.current) return
    setSigningOut(true)
    if (!(await navigate({ external: "portal" }))) setSigningOut(false)
  }

  // Focus returns to the button when the dialog opens or a ping settles.
  useEffect(() => {
    if (open && !busy) buttonRef.current?.focus()
  }, [open, busy])

  const [before, after] = IDLE_MESSAGES.description.split("{time}")
  // Decorative: the share of the warning's minute left, drawn as a scaled bar (transform only).
  const share = Math.min(1, Math.max(0, secondsLeft / (IDLE_WARNING_LEAD_MS / 1000)))
  return (
    <Dialog open={open}>
      <DialogContent
        role="alertdialog"
        data-slot="idle-warning"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          // Escape means "Stay signed in"; the warning closes once the ping lands, not before.
          event.preventDefault()
          if (!signingOut) void stay()
        }}
        onPointerDownOutside={preventDismiss}
        onInteractOutside={preventDismiss}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          buttonRef.current?.focus()
        }}
      >
        <DialogHeader className="gap-3 pr-6 pb-5">
          <span aria-hidden="true" className="bg-tint-blue-strong text-tint-blue-strong-foreground inline-flex size-12 items-center justify-center rounded-full">
            <Hourglass className="size-6" />
          </span>
          <DialogTitle>{IDLE_MESSAGES.title}</DialogTitle>
          <DialogDescription className="text-body">
            {before}
            <span role="timer" data-slot="idle-countdown" className="text-foreground font-semibold tabular-nums">
              {formatIdleCountdown(secondsLeft)}
            </span>
            {after}
          </DialogDescription>
          <div aria-hidden="true" className="bg-tint-blue-surface mt-1 h-1 overflow-hidden rounded-full">
            <div
              data-slot="idle-countdown-bar"
              className="bg-brand-primary h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-1000 motion-safe:ease-linear"
              style={{ transform: `scaleX(${share})` }}
            />
          </div>
        </DialogHeader>
        <p role="status" className="sr-only">
          {busy ? IDLE_MESSAGES.staying : idleMilestone(secondsLeft)}
        </p>
        <DialogFooter className="max-sm:flex-col-reverse max-sm:items-stretch">
          <Button type="button" variant="outline" size="touch" busy={signingOut} aria-disabled={busy || undefined} onClick={() => void signOut()}>
            {IDLE_MESSAGES.signOut}
          </Button>
          {/* busy (aria-busy + aria-disabled), not disabled: focus stays on the button while the ping is pending. */}
          <Button ref={buttonRef} type="button" size="touch" busy={busy} aria-disabled={signingOut || undefined} onClick={() => void stay()}>
            {IDLE_MESSAGES.stay}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
