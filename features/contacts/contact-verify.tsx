"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { useAnnounce } from "@/components/ui/live-status"
import { StatusBadge } from "@/components/ui/status-badge"
import { toastError, useCountdown, type RowAction } from "@/features/shell"
import { sendContactVerification, type ErrorScope } from "@/lib/api"
import { CONTACT_LABEL_HOME } from "@/lib/shared/contact-labels"
import { COMMON_MESSAGES, CONTACT_MESSAGES, formatMessage } from "@/lib/shared/messages"

/**
 * The verify flow the Contact Sections share (Team A, Epic 3: Phone since
 * Story 3.3, Email since Story 3.6): the per-row send state, the countdown,
 * the Status cell, the Verify / Resend verification row action and the hook
 * that sends links. Not foundation: only `features/contacts` imports it.
 */

/** How long a sent link's "Resend in {n} s" counts down. */
export const CONTACT_VERIFY_COUNTDOWN_MS = 60_000

/**
 * A row's verification state this session, held by the Section and keyed by
 * id (cells remount when the layout swaps at 768 px, so they only read it):
 * `sent` until its deadline, then "Not verified"; `failed` and `cooldown`
 * hold no deadline. Any entry means a link was asked for, so the action
 * reads "Resend verification". A reload forgets it.
 */
export type ContactVerifyState = { readonly kind: "sent"; readonly deadline: number } | { readonly kind: "failed" } | { readonly kind: "cooldown" }

export type ContactVerifyStates = ReadonlyMap<number, ContactVerifyState>

/**
 * The seconds left before a sent link may be resent (0 when not counting):
 * `useCountdown`, seeded from the Section-held deadline when the cell
 * mounts, so a remounted cell (the 768 px layout swap) keeps the right time.
 */
export function useResendSeconds(state: ContactVerifyState | undefined): number {
  const { remaining, running, start, stop } = useCountdown()
  const deadline = state?.kind === "sent" ? state.deadline : undefined
  useLayoutEffect(() => {
    const left = deadline === undefined ? 0 : (deadline - Date.now()) / 1000
    if (left > 0) start(left)
    else stop()
  }, [deadline, start, stop])
  return running ? remaining : 0
}

/** "Link sent · Resend in {n} s". */
export const contactResendInText = (seconds: number): string => formatMessage(CONTACT_MESSAGES.verifyCountdown, { n: seconds })

export interface ContactVerifyStatusProps {
  /** The row's label as read (a Home row shows no status). */
  readonly label: string | null
  readonly isVerified: boolean | null
  readonly state: ContactVerifyState | undefined
  /** The help line of the backend's cooldown ("…Check your texts." / "…Check your email."). */
  readonly cooldownHelp: string
}

/**
 * The Status cell (read view and the saved rows of edit view): empty on a
 * Home row; "Verified" once the list says so (whatever was sent); during a
 * sent link's countdown the pending "Link sent · Resend in {n} s", updated
 * each second; else "Not verified", with the help line of a failed send or
 * of the backend's cooldown.
 */
export function ContactVerifyStatus({ label, isVerified, state, cooldownHelp }: ContactVerifyStatusProps) {
  const seconds = useResendSeconds(state)
  if (label === CONTACT_LABEL_HOME) return null
  if (isVerified === true) return <StatusBadge status="verified">{COMMON_MESSAGES.verified}</StatusBadge>
  if (seconds > 0) return <StatusBadge status="pending">{contactResendInText(seconds)}</StatusBadge>
  const help = state?.kind === "failed" ? CONTACT_MESSAGES.verifySendFailed : state?.kind === "cooldown" ? cooldownHelp : null
  const badge = <StatusBadge status="notVerified">{COMMON_MESSAGES.notVerified}</StatusBadge>
  if (!help) return badge
  return (
    <span className="flex flex-col gap-0.5">
      {badge}
      <span data-slot="verify-help" className="text-muted-foreground text-caption">
        {help}
      </span>
    </span>
  )
}

/**
 * A verifiable row's Verify / Resend verification action (inline and in the
 * kebab): "Resend verification" once a link was asked for, aria-disabled
 * with "Link sent · Resend in {n} s" during the countdown.
 */
export function contactVerifyAction(state: ContactVerifyState | undefined, seconds: number, onSelect: () => void): RowAction {
  return {
    id: "verify",
    label: state ? COMMON_MESSAGES.resendVerification : COMMON_MESSAGES.verify,
    inline: true,
    disabledReason: seconds > 0 ? contactResendInText(seconds) : undefined,
    onSelect,
  }
}

export interface ContactVerification {
  /** The rows' states, keyed by id. */
  readonly states: ContactVerifyStates
  /** The polite announcement ("Link sent", the cooldown help, "Couldn't send the link"), for the Section's `LiveStatus`. */
  readonly announcement: string
  /** The auto-verify after a save: sends links to `ids`; a send that can't get through marks them failed, with no toast. Never throws. */
  readonly sendAfterSave: (ids: readonly number[]) => Promise<void>
  /**
   * The read view's Verify / Resend verification: sends `[id]` at once,
   * unless `isVerifiable(id)` (the latest rows) says no or it is counting
   * down. One that can't get through shows the error toast, whose Retry goes
   * through these checks again.
   */
  readonly verify: (id: number) => void
}

/**
 * The verify flow of one Contact Section (Stories 3.3, 3.6): the send state
 * keyed by id, the announcement and the two ways to send. `scope` maps the
 * failures (`sendContactVerification`), `cooldownHelp` is the cooldown's
 * announcement, and `isVerifiable(id)` tells whether the latest rows still
 * offer Verify on `id` (it is read when a send starts, never stale).
 */
export function useContactVerification(scope: ErrorScope, cooldownHelp: string, isVerifiable: (id: number) => boolean): ContactVerification {
  const [states, setStates] = useState<ContactVerifyStates>(() => new Map())
  const { message: announcement, announce } = useAnnounce()
  /** The ids whose send is in flight: a repeat press meanwhile does nothing. */
  const verifying = useRef(new Set<number>())

  /**
   * Sends verification links to `ids` (those not already in flight) and
   * records the outcome: a sent id starts its 60 s countdown and "Link sent"
   * is announced once; failed and cooldown ids keep "Not verified" with
   * their help, which is announced when no link went out. A session end
   * does nothing (the shell owns it). A manual send (one row) that can't get
   * through leaves the row as it was and resolves `true`, for the caller's
   * error toast; the auto-verify after a save marks every such id failed,
   * with no toast.
   */
  const send = useCallback(
    async (ids: readonly number[], manual: boolean): Promise<boolean> => {
      const fresh = ids.filter((id) => !verifying.current.has(id))
      if (fresh.length === 0) return false
      for (const id of fresh) verifying.current.add(id)
      try {
        const outcome = await sendContactVerification(fresh, scope)
        const keepFailed = !(manual && outcome.network)
        const deadline = Date.now() + CONTACT_VERIFY_COUNTDOWN_MS
        setStates((current) => {
          const next = new Map(current)
          for (const id of outcome.sent) next.set(id, { kind: "sent", deadline })
          if (keepFailed) for (const id of outcome.failed) next.set(id, { kind: "failed" })
          for (const id of outcome.cooldown) next.set(id, { kind: "cooldown" })
          return next
        })
        if (outcome.sent.length > 0) announce(CONTACT_MESSAGES.verifyLinkSent)
        else if (outcome.cooldown.length > 0) announce(cooldownHelp)
        else if (keepFailed && outcome.failed.length > 0) announce(CONTACT_MESSAGES.verifySendFailed)
        return !keepFailed
      } finally {
        for (const id of fresh) verifying.current.delete(id)
      }
    },
    [announce, scope, cooldownHelp],
  )

  // The states and the row check of the latest render: a kebab item runs after its menu closes, from an older render,
  // and a toast's Retry later still.
  const latestStates = useRef(states)
  const latestVerifiable = useRef(isVerifiable)
  useLayoutEffect(() => {
    latestStates.current = states
    latestVerifiable.current = isVerifiable
  })

  function verify(id: number): void {
    if (!latestVerifiable.current(id)) return
    const state = latestStates.current.get(id)
    if (state?.kind === "sent" && state.deadline > Date.now()) return
    void send([id], true).then((unreached) => {
      if (unreached) toastError(CONTACT_MESSAGES.verifyNetwork, { onRetry: () => verify(id) })
    })
  }

  async function sendAfterSave(ids: readonly number[]): Promise<void> {
    if (ids.length > 0) await send(ids, false)
  }

  return { states, announcement, sendAfterSave, verify }
}
