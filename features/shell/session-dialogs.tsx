"use client"

import { useEffect, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { subscribe } from "@/lib/api"
import { SESSION_CHANGED_COPY, SESSION_EXPIRED_COPY } from "@/lib/shared/messages"

/**
 * =============================================================================
 * Session dialogs (AD-19, Story 1.7)
 * =============================================================================
 *
 * The shell's single listener for `session-expired` / `session-changed`, and
 * the only module that opens these dialogs.
 *
 * - **First event wins.** The first event handled sets the dialog kind; any
 *   later event (either kind) is ignored entirely: no callbacks, no cache
 *   clear, no second dialog.
 * - **`session-expired`:** every `onBeforeSessionExpired` callback runs
 *   synchronously (drafts, Story 1.15), then "Your session ended" opens. Its
 *   action is a plain link to `portalUrl` (no logout, no leave guard, no draft
 *   deletion). The app is never framed (D10), so there is no framed variant.
 * - **`session-changed`:** every `onSessionChanged` callback runs (in-memory
 *   clearing, 2.x), the whole SWR cache is emptied without revalidating, and
 *   "This profile was opened by another account in another tab" opens with
 *   "Reload". No `onBeforeSessionExpired` callback runs (no draft is written).
 *
 * Both dialogs are non-dismissable `alertdialog`s; the page stays mounted
 * behind the overlay. Each callback is isolated: a throw is logged by error
 * name only and never stops the others or the dialog.
 * =============================================================================
 */

type Callback = () => void

const beforeExpiredCallbacks = new Set<Callback>()
const changedCallbacks = new Set<Callback>()

function register(set: Set<Callback>, cb: Callback): () => void {
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

/** Run `cb` before the session-expired dialog opens (e.g. write drafts). Returns an unsubscribe function. */
export function onBeforeSessionExpired(cb: Callback): () => void {
  return register(beforeExpiredCallbacks, cb)
}

/** Run `cb` when another account took over the session (e.g. clear in-memory state). Returns an unsubscribe function. */
export function onSessionChanged(cb: Callback): () => void {
  return register(changedCallbacks, cb)
}

/** Run every callback in registration order, each isolated. */
function runAll(set: Set<Callback>, label: string): void {
  for (const cb of Array.from(set)) {
    try {
      cb()
    } catch (error) {
      console.error(`[pp session-dialogs] ${label} callback failed:`, error instanceof Error ? error.name : "error")
    }
  }
}

type Kind = "expired" | "changed"

/** Shared non-dismissable `DialogContent` props. */
const NON_DISMISSABLE = {
  role: "alertdialog",
  showCloseButton: false,
  className: "bg-popover",
  onEscapeKeyDown: (event: Event) => event.preventDefault(),
  onPointerDownOutside: (event: Event) => event.preventDefault(),
  onInteractOutside: (event: Event) => event.preventDefault(),
} as const

/** The idle warning's visible focus-ring classes plus the 44 px target. */
const ACTION_CLASS = "min-h-11 focus:border-ring focus:ring-[3px] focus:ring-ring/50"

export function SessionDialogs({ portalUrl }: { portalUrl: string }) {
  const [kind, setKind] = useState<Kind | null>(null)
  const handledRef = useRef(false)
  const { mutate } = useSWRConfig()
  const linkRef = useRef<HTMLAnchorElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onExpired = () => {
      if (handledRef.current) return
      handledRef.current = true
      runAll(beforeExpiredCallbacks, "onBeforeSessionExpired")
      setKind("expired")
    }
    const onChanged = () => {
      if (handledRef.current) return
      handledRef.current = true
      runAll(changedCallbacks, "onSessionChanged")
      void mutate(() => true, undefined, { revalidate: false })
      setKind("changed")
    }
    const unsubscribeExpired = subscribe("session-expired", onExpired)
    const unsubscribeChanged = subscribe("session-changed", onChanged)
    return () => {
      unsubscribeExpired()
      unsubscribeChanged()
    }
  }, [mutate])

  const focusAction = (event: Event) => {
    event.preventDefault()
    ;(linkRef.current ?? buttonRef.current)?.focus()
  }

  if (kind === "expired") {
    return (
      <Dialog open>
        <DialogContent {...NON_DISMISSABLE} onOpenAutoFocus={focusAction}>
          <DialogTitle>{SESSION_EXPIRED_COPY.title}</DialogTitle>
          <DialogDescription>{SESSION_EXPIRED_COPY.body}</DialogDescription>
          <div className="flex justify-end">
            <Button asChild className={ACTION_CLASS}>
              <a ref={linkRef} href={portalUrl}>
                {SESSION_EXPIRED_COPY.action}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (kind === "changed") {
    return (
      <Dialog open>
        <DialogContent {...NON_DISMISSABLE} aria-describedby={undefined} onOpenAutoFocus={focusAction}>
          <DialogTitle>{SESSION_CHANGED_COPY.title}</DialogTitle>
          <div className="flex justify-end">
            <Button ref={buttonRef} type="button" className={ACTION_CLASS} onClick={() => window.location.reload()}>
              {SESSION_CHANGED_COPY.reload}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
