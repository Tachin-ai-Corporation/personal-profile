"use client"

import { useEffect, useRef, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { sessionEvents as defaultSessionEvents, type SessionEvents } from "@/lib/api"
import { COMMON_MESSAGES, LEAVE_GUARD_MESSAGES } from "@/lib/shared/messages"
import { isUnloadConfirmed, setLeaveGuard } from "./leave"
import { sectionHeadingId, type SectionId } from "./nav-types"
import { runSaveAll, saveAllSummary } from "./save-all"
import { toastPartial } from "./toasts"
import { useIsAnyDirty, useSectionRegistry } from "./section-registry"

interface Pending {
  readonly resolve: (proceed: boolean) => void
  readonly canSave: boolean
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (isUnloadConfirmed()) return
  event.preventDefault()
  // Older browsers show the native prompt only when returnValue is set.
  event.returnValue = ""
}

/**
 * The page's leave guard (Story 1.13): registers with `setLeaveGuard`, so
 * `navigate()` asks before leaving while any Section is dirty, and attaches
 * `beforeunload` only while something is dirty. Mounted once per page, inside
 * the page's `SectionRegistryProvider`.
 */
export interface LeaveGuardProps {
  /** Test seam. */
  readonly events?: SessionEvents
  /** The page's save order for Save (e.g. Team A's `SAVE_ORDER` on `/`); defaults to `displayOrder`. */
  readonly order?: readonly SectionId[]
}

export function LeaveGuard({ events = defaultSessionEvents, order }: LeaveGuardProps = {}) {
  const registry = useSectionRegistry()
  const anyDirty = useIsAnyDirty()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const pendingRef = useRef<Pending | null>(null)
  const focusAfterClose = useRef<(() => void) | null>(null)

  useEffect(() => {
    const clear = setLeaveGuard(() => {
      const dirty = registry.getDirty()
      if (dirty.length === 0) return Promise.resolve(true)
      // A second leave while the dialog is open is refused; the first one decides.
      if (pendingRef.current) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const next = { resolve, canSave: dirty.every((section) => section.canSave) }
        pendingRef.current = next
        setPending(next)
      })
    })
    return () => {
      clear()
      // Unmounted with a leave pending: that leave doesn't happen.
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    }
  }, [registry])

  // The session ended (e.g. during a Save from this dialog): cancel the leave and close,
  // so only the session-expired dialog remains.
  useEffect(() => events.subscribe("session-expired", () => settle(false)), [events])

  useEffect(() => {
    if (!anyDirty) return
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [anyDirty])

  function settle(proceed: boolean): void {
    pendingRef.current?.resolve(proceed)
    pendingRef.current = null
    setPending(null)
    setBusy(false)
  }

  function discard(): void {
    for (const section of registry.getDirty()) section.discard()
    settle(true)
  }

  async function save(): Promise<void> {
    setBusy(true)
    let proceed = false
    let stayOpen = false
    try {
      // The Save-all runner: validates everything first (nothing sent if anything is invalid),
      // saves the Save-all Sections, then the guard-only participants; stops on a session end.
      // Not a Save-all run: no `save_all` telemetry.
      const outcome = await runSaveAll(registry, { order, includeGuardOnly: true, trackTelemetry: false })
      if (outcome.kind === "invalid") focusAfterClose.current = outcome.focusFirstInvalid
      proceed = outcome.kind === "clean" || (outcome.kind === "done" && outcome.failed.length === 0 && outcome.cancelled.length === 0)
      // The user declined a step of a save (F6-1): stay in this dialog quietly (no toast, focus left as is),
      // so they can choose again (Keep editing, Discard or Save).
      stayOpen = outcome.kind === "done" && outcome.failed.length === 0 && outcome.cancelled.length > 0
      if (outcome.kind === "done" && outcome.failed.length > 0) {
        // Stay, say what failed ("1 saved, 1 failed") and land on the first failed Section.
        const summary = saveAllSummary(outcome)
        if (summary?.tone === "partial") toastPartial(summary.text)
        const failedId = sectionHeadingId(outcome.failed[0].id)
        focusAfterClose.current = () => document.getElementById(failedId)?.focus()
      }
    } finally {
      // Always settles (or at least un-busies), so the dialog never stays busy.
      if (stayOpen) setBusy(false)
      else settle(proceed)
    }
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      title={LEAVE_GUARD_MESSAGES.title}
      body={pending?.canSave === false ? LEAVE_GUARD_MESSAGES.bodyCannotSave : LEAVE_GUARD_MESSAGES.body}
      variant="standard"
      cancelLabel={LEAVE_GUARD_MESSAGES.keepEditing}
      extraAction={{ label: COMMON_MESSAGES.discard, onClick: discard }}
      confirmLabel={COMMON_MESSAGES.save}
      showConfirm={pending?.canSave !== false}
      busy={busy}
      onCancel={() => settle(false)}
      onConfirm={() => void save()}
      onCloseFocus={() => {
        const focus = focusAfterClose.current
        focusAfterClose.current = null
        if (!focus) return false
        focus()
        return true
      }}
    />
  )
}
