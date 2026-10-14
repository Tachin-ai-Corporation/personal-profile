"use client"

import { useEffect, useRef, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { sessionEvents as defaultSessionEvents, type SessionEvents } from "@/lib/api"
import { COMMON_MESSAGES, LEAVE_GUARD_MESSAGES } from "@/lib/shared/messages"
import { isUnloadConfirmed, setLeaveGuard } from "./leave"
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
}

export function LeaveGuard({ events = defaultSessionEvents }: LeaveGuardProps = {}) {
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
    try {
      const dirty = registry.getDirty()
      // Validate everything first: if anything is invalid, nothing is sent.
      for (const section of dirty) {
        const result = await section.validate()
        if (!result.valid) {
          focusAfterClose.current = result.focusFirstInvalid
          return
        }
      }
      let allSaved = true
      for (const section of dirty) {
        const result = await section.save()
        if (!result.ok) allSaved = false
      }
      proceed = allSaved
    } finally {
      // Always settles, so the dialog never stays busy.
      settle(proceed)
    }
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      title={LEAVE_GUARD_MESSAGES.title}
      body={pending?.canSave === false ? LEAVE_GUARD_MESSAGES.bodyCannotSave : LEAVE_GUARD_MESSAGES.body}
      variant="standard"
      cancelLabel={LEAVE_GUARD_MESSAGES.keepEditing}
      extraAction={{ label: LEAVE_GUARD_MESSAGES.discard, onClick: discard }}
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
