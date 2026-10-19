"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { toastError, toastSuccess } from "@/features/shell"
import { contactPointsDiffToManageDTO, PRIMARY_LABEL, saveContactPoints, type ContactPoint, type ErrorScope, type MappedError } from "@/lib/api"
import { COMMON_MESSAGES, CONTACT_MESSAGES, formatMessage, messageFor, SECTION_MESSAGES } from "@/lib/shared/messages"

/**
 * The Make primary flow the Contact Sections share (Team A, Epic 3: Phone
 * since Story 3.4, Email since Story 3.6): the saved rows after the switch,
 * the failure text and the hook that opens the standard confirm and sends
 * the one manage POST. Not foundation: only `features/contacts` imports it.
 */

/**
 * The saved rows after Make primary on `id`: that row labelled Primary,
 * listed first (so it leads `contactPointsToUpdate`), then the others as
 * saved. The engine relabels the old Primary "Old" and turns the new one's
 * notifications on.
 */
export function withPrimary(saved: readonly ContactPoint[], id: number): ContactPoint[] {
  const target = saved.find((point) => point.id === id)
  const others = saved.filter((point) => point.id !== id)
  return target ? [{ ...target, label: PRIMARY_LABEL }, ...others] : others
}

/**
 * The Make primary error toast's text: a backend Primary rule's own message
 * (the email-in-use rule included), else "Couldn't save {section}. Check
 * your connection." for a network failure, else "Couldn't save {section}.".
 */
export function contactPrimaryFailureText(mapped: MappedError, sectionLabel: string): string {
  if (mapped.kind === "field" && mapped.field === "primary") return messageFor(mapped.messageKey)
  const section = sectionLabel.toLowerCase()
  return formatMessage(mapped.kind === "network" ? SECTION_MESSAGES.networkFailure : SECTION_MESSAGES.saveFailed, { section })
}

/** The row an open confirm is about. */
export interface ContactPrimaryCandidate {
  /** How the confirm names it (the formatted number, the address). */
  readonly name: string
  /** The type's current Primary is relabelled Old by the change (the body's second sentence). */
  readonly relabelsOld: boolean
}

export interface MakePrimaryOptions {
  /** The scope the manage POST's failure is mapped with. */
  readonly scope: ErrorScope
  /** The Section's label ("Phone", "Email"): the toasts' `{section}`. */
  readonly sectionLabel: string
  /** The Section `h2` the success moves focus to. */
  readonly headingId: string
  /** The row `id` stands for when Make primary is still enabled on it (latest rows, read view only), else `undefined`. */
  readonly eligible: (id: number) => ContactPrimaryCandidate | undefined
  /** The saved rows the engine diffs against (latest). */
  readonly savedPoints: () => readonly ContactPoint[]
  /** Revalidates the Section's keys and `myself`, invalidating obsolete IDs only after an acknowledged write; never rejects. */
  readonly refetch: (saved: boolean) => Promise<unknown>
  /** The confirm's body for `name` (the second sentence only when `relabelsOld`); an element may wrap a long name. */
  readonly body: (candidate: ContactPrimaryCandidate) => ReactNode
}

export interface MakePrimary {
  /** The row action: opens the confirm for an eligible row (a stale or disabled one does nothing). */
  readonly open: (id: number) => void
  /** The confirm, rendered by the Section. */
  readonly dialog: ReactNode
}

/**
 * Make primary (Stories 3.4, 3.6): `open(id)` shows the standard confirm
 * ("This changes how you sign in", focus on Cancel; Cancel or Escape sends
 * nothing and returns focus to the trigger). Confirm keeps it busy while the
 * one manage POST goes out (`withPrimary`: the new Primary with
 * notifications on, the old one relabelled Old), then refetches, toasts
 * "{Section} saved." and focuses the `h2`. On failure the keys are
 * refetched first (the server may have changed), then the error toast
 * shows, whose Retry re-checks the latest rows and sends again with no
 * confirm. A session end shows nothing (the shell owns it). Never throws: an
 * engine refusal (a programmer error) toasts "Couldn't save {section}." and
 * sends nothing; its Retry only revalidates.
 */
export function useMakePrimary(options: MakePrimaryOptions): MakePrimary {
  const [confirm, setConfirm] = useState<(ContactPrimaryCandidate & { readonly id: number }) | null>(null)
  const [busy, setBusy] = useState(false)
  /** A Make primary in flight: a second one meanwhile (a repeated Retry) does nothing. */
  const sending = useRef(false)
  /** The confirm closes after a success: focus goes to the `h2` instead of back to the trigger. */
  const focusHeadingOnClose = useRef(false)
  // The options of the latest render: a kebab item runs after its menu closes, from an older render, and a toast's Retry later still.
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  /** Sends the Make primary on `id`, if it is still eligible; `true` once saved and refetched. */
  async function send(id: number): Promise<boolean> {
    const { eligible, savedPoints, refetch, scope, sectionLabel } = latest.current
    if (sending.current || !eligible(id)) return false
    sending.current = true
    try {
      const saved = savedPoints()
      const dto = contactPointsDiffToManageDTO(saved, withPrimary(saved, id))
      if (dto === null) return false
      const result = await saveContactPoints(dto, scope)
      // Saved or not, a failed refetch is left to the next read.
      await refetch(result.ok)
      if (result.ok) return true
      const { mapped } = result.error
      if (mapped.kind !== "session") toastError(contactPrimaryFailureText(mapped, sectionLabel), { onRetry: () => void retry(id) })
      return false
    } catch {
      toastError(contactPrimaryFailureText({ kind: "generic" }, sectionLabel), { onRetry: () => void latest.current.refetch(false) })
      return false
    } finally {
      sending.current = false
    }
  }

  /** The success toast, "{Section} saved." (focus moves to the `h2` as the confirm closes, or at once after a Retry). */
  function saved(): void {
    toastSuccess(formatMessage(SECTION_MESSAGES.saved, { section: latest.current.sectionLabel }))
  }

  /** The error toast's Retry: no confirm (the user already confirmed). */
  async function retry(id: number): Promise<void> {
    if (!(await send(id))) return
    saved()
    document.getElementById(latest.current.headingId)?.focus()
  }

  function open(id: number): void {
    const candidate = latest.current.eligible(id)
    if (!candidate) return
    focusHeadingOnClose.current = false
    setConfirm({ ...candidate, id })
  }

  /** Confirm: the dialog stays open and busy until the outcome, then closes (focus: the `h2` on success, else the trigger). */
  async function confirmPrimary(): Promise<void> {
    if (!confirm || busy) return
    setBusy(true)
    let ok = false
    try {
      ok = await send(confirm.id)
    } finally {
      // Whatever happens, the dialog never stays open and busy.
      focusHeadingOnClose.current = ok
      setBusy(false)
      setConfirm(null)
    }
    if (ok) saved()
  }

  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      variant="standard"
      title={CONTACT_MESSAGES.makePrimaryTitle}
      body={confirm ? options.body(confirm) : null}
      confirmLabel={COMMON_MESSAGES.makePrimary}
      busy={busy}
      onConfirm={() => void confirmPrimary()}
      onCancel={() => setConfirm(null)}
      onCloseFocus={() => {
        if (!focusHeadingOnClose.current) return false
        focusHeadingOnClose.current = false
        const heading = document.getElementById(latest.current.headingId)
        heading?.focus()
        return heading !== null
      }}
    />
  )

  return { open, dialog }
}
