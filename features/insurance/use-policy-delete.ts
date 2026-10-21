"use client"

import { useLayoutEffect, useRef, useState } from "react"
import type { ConfirmDialogProps } from "@/components/ui/confirm-dialog"
import { toastError, toastPartial, toastSuccess, type ShownToast } from "@/features/shell"
import { deleteInsurancePolicy, fetchInsurance, mapApiError, type ApiResponse, type InsurancePolicy, type MappedError } from "@/lib/api"
import { formatMessage, INSURANCE_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { insurancePolicyName } from "./format"
import { dropInsurancePendingCards } from "./pending-cards"

/**
 * The backend's "already gone" answers to a delete (decision 1B): not found
 * joined to the user, already Deleted, or no longer linked to the user. All
 * three are mapped to `policy` (`lib/api/errors/insurance.ts`).
 */
export const isInsurancePolicyGone = (mapped: MappedError): boolean => mapped.kind === "field" && mapped.field === "policy"

/**
 * The delete's failure text: "Couldn't delete insurance policy. Check your
 * connection." for a network failure, no access for an upstream 403, else
 * "Couldn't delete insurance policy." (a field rule of another request
 * included).
 */
export function insuranceDeleteFailureText(mapped: MappedError): string {
  if (mapped.kind === "network") return INSURANCE_MESSAGES.deleteNetworkFailure
  if (mapped.kind === "forbidden") return STATE_MESSAGES.noAccess
  return INSURANCE_MESSAGES.deleteFailed
}

/**
 * Whether sending the same delete again can help: a network failure, or a
 * generic one that isn't a 4xx refusal (a 5xx, or no status), unless the
 * answer said `retryable: false`. No access, proxy refusals and other 4xx
 * answers get no Retry.
 */
export function insuranceDeleteRetryable(mapped: MappedError, response: Pick<ApiResponse<unknown>, "statusCode" | "retryable">): boolean {
  if (response.retryable === false) return false
  if (mapped.kind === "network") return true
  return mapped.kind === "generic" && (response.statusCode === undefined || response.statusCode >= 500)
}

/** The cached list with `id` read as Deleted (no kebab) until the next revalidation. */
const markedDeleted = (id: number) => (current: InsurancePolicy[] | undefined): InsurancePolicy[] | undefined =>
  current?.map((policy) => (policy.id === id ? { ...policy, deleted: true } : policy))

export interface InsurancePolicyDeleteOptions {
  /** The cards in display order (`sortInsurancePolicies`): the focus order after a delete. */
  readonly policies: readonly InsurancePolicy[] | undefined
  /** Writes `keys.insurance()` without revalidating (the fresh list, or the cached one with the policy marked Deleted). */
  readonly store: (next: (current: InsurancePolicy[] | undefined) => InsurancePolicy[] | undefined) => Promise<unknown>
  /** The "Add insurance" buttons focus falls back to when no active card is left, in order (the empty card's, then the header's). */
  readonly addButtons: () => readonly (HTMLElement | null | undefined)[]
  /** A policy was removed: e.g. the editor drops it if it holds it. */
  readonly onRemoved: (policyId: number) => void
}

export interface InsurancePolicyDelete {
  /** The kebab's "Delete": opens the confirm for an active, saved policy with no delete in flight (anything else does nothing). */
  readonly open: (policy: InsurancePolicy) => void
  /** A delete of this policy is in flight: its kebab's "Delete" is unavailable. */
  readonly isDeleting: (policyId: number) => boolean
  /** A card's `RowActions kebabRef`: where focus goes when the card before it is deleted. */
  readonly kebabRef: (policyId: number) => (element: HTMLButtonElement | null) => void
  /** The confirm's props: the Section renders `<ConfirmDialog {...dialog} />`. */
  readonly dialog: ConfirmDialogProps
}

/** How one send ended: removed (200), already gone (decision 1B), or not (a toast showed, or nothing for a session end). */
type DeleteOutcome = "deleted" | "gone" | "failed"

/** The confirm: kept (with `open: false`) after it closes, so its body doesn't blank during the exit animation. */
interface Confirming {
  readonly open: boolean
  readonly id: number
  readonly name: string
}

/** Focus is nobody's: on the page body, or on the toast whose Retry ran. */
function focusIsFree(): boolean {
  const active = document.activeElement
  if (active === null || active === document.body) return true
  return active.closest('[role="region"][aria-label^="Notifications"]') !== null
}

/**
 * Delete a policy (Story 5.5, FR30): `open(policy)` shows the destructive
 * confirm ("Delete this insurance policy?", focus on Cancel; Cancel or
 * Escape sends nothing and returns focus to the kebab). Confirm keeps it busy
 * ("Deleting…", not dismissible) while the one `DELETE v2/health/insurance/
 * {id}` goes out and the list is read again, then closes whatever the outcome:
 * - deleted (200): "Insurance policy deleted.";
 * - already gone (the backend's 400 texts, decision 1B): "This policy was
 *   already removed.";
 * either way the policy's in-memory card images (5.3) are dropped, an editor
 *   holding it is closed, the fresh list goes into the key (or, if that read
 *   fails, the cached policy reads Deleted), and focus moves to the next
 *   card's kebab, else the previous one's, else "Add insurance";
 * - failed: the card is unchanged, focus returns to the kebab, and a toast
 *   shows: a network, 5xx or unknown failure as an error toast that stays,
 *   whose Retry sends the delete again with no confirm (focus moves only if
 *   it is still free); a refusal (no access, 4xx) as a toast without Retry.
 *   A session end shows nothing (the shell owns it).
 * One delete per policy at a time, and one failure toast per policy. Never throws.
 */
export function useInsurancePolicyDelete(options: InsurancePolicyDeleteOptions): InsurancePolicyDelete {
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [busy, setBusy] = useState(false)
  /** The policies with a delete in flight (the guard), mirrored in `deleting` for rendering. */
  const sending = useRef(new Set<number>())
  const [deleting, setDeleting] = useState<ReadonlySet<number>>(() => new Set())
  /** Each policy's failure toast: dismissed when a new attempt starts or the policy is removed. */
  const failures = useRef(new Map<number, ShownToast>())
  /** Each active card's kebab, by policy id. */
  const kebabs = useRef(new Map<number, HTMLButtonElement>())
  // One stable callback per policy (looked up while rendering the cards, so held in state, not a ref).
  const [kebabCallbacks] = useState(() => new Map<number, (element: HTMLButtonElement | null) => void>())
  /** Set as the confirm closes after a removal: the focus move `onCloseFocus` makes instead of returning to the kebab. */
  const focusOnClose = useRef<(() => boolean) | null>(null)
  // The options of the latest render: a kebab item runs after its menu closes, from an older render, and a toast's Retry later still.
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  function kebabRef(policyId: number): (element: HTMLButtonElement | null) => void {
    let callback = kebabCallbacks.get(policyId)
    if (!callback) {
      callback = (element) => {
        if (element) kebabs.current.set(policyId, element)
        else kebabs.current.delete(policyId)
      }
      kebabCallbacks.set(policyId, callback)
    }
    return callback
  }

  /** The active cards' ids in display order, before the delete changes the list. */
  const activeOrder = (): number[] =>
    (latest.current.policies ?? []).flatMap((policy) => (policy.deleted || policy.id === null ? [] : [policy.id]))

  /**
   * After a removal: the kebab of the next active card in the old order, else
   * of the previous one (nearest first), else "Add insurance". `true` once
   * focus moved.
   */
  function focusAfterRemoval(order: readonly number[], id: number): boolean {
    const index = order.indexOf(id)
    const candidates = index < 0 ? [] : [...order.slice(index + 1), ...order.slice(0, index).reverse()]
    for (const candidate of candidates) {
      const kebab = kebabs.current.get(candidate)
      if (kebab?.isConnected) {
        kebab.focus()
        return true
      }
    }
    for (const button of latest.current.addButtons()) {
      if (button?.isConnected) {
        button.focus()
        return true
      }
    }
    return false
  }

  function setSending(id: number, on: boolean): void {
    if (on) sending.current.add(id)
    else sending.current.delete(id)
    setDeleting(new Set(sending.current))
  }

  function dismissFailure(id: number): void {
    failures.current.get(id)?.dismiss()
    failures.current.delete(id)
  }

  /**
   * After a removal (never reported as a failure, whatever throws here):
   * drops the pending images, closes an editor holding the policy, and reads
   * the list again (on a failed read, the cached policy reads Deleted).
   */
  async function afterRemoval(id: number): Promise<void> {
    const steps: (() => unknown)[] = [() => dismissFailure(id), () => dropInsurancePendingCards(id), () => latest.current.onRemoved(id)]
    for (const step of steps) {
      try {
        step()
      } catch {
        // The delete went through: a local step that throws doesn't undo it.
      }
    }
    try {
      const fresh = await fetchInsurance()
      await latest.current.store(fresh.success && fresh.data ? () => fresh.data : markedDeleted(id))
    } catch {
      try {
        await latest.current.store(markedDeleted(id))
      } catch {
        // Left to the next revalidation.
      }
    }
  }

  /** Sends the delete of `id` once (`order`: the active cards when it was asked for, for focus after a Retry). */
  async function send(id: number, order: readonly number[]): Promise<DeleteOutcome> {
    if (sending.current.has(id)) return "failed"
    setSending(id, true)
    dismissFailure(id)
    try {
      let res: ApiResponse<unknown>
      try {
        res = await deleteInsurancePolicy(id)
      } catch {
        res = { success: false }
      }
      const mapped = res.success ? null : mapApiError("insurance", res)
      if (mapped === null || isInsurancePolicyGone(mapped)) {
        await afterRemoval(id)
        return mapped === null ? "deleted" : "gone"
      }
      if (mapped.kind === "session") return "failed"
      const text = insuranceDeleteFailureText(mapped)
      failures.current.set(
        id,
        insuranceDeleteRetryable(mapped, res) ? toastError(text, { onRetry: () => void retry(id, order) }) : toastPartial(text),
      )
      return "failed"
    } finally {
      setSending(id, false)
    }
  }

  /** The removal's toast: "Insurance policy deleted.", or "This policy was already removed." (decision 1B, no info toast in the shell). */
  function removed(outcome: DeleteOutcome): void {
    if (outcome === "deleted") toastSuccess(INSURANCE_MESSAGES.policyDeleted)
    else if (outcome === "gone") toastSuccess(INSURANCE_MESSAGES.policyAlreadyRemoved)
  }

  /** The error toast's Retry: no confirm (the user already confirmed); focus moves as after a confirm, if nobody else holds it. */
  async function retry(id: number, order: readonly number[]): Promise<void> {
    const outcome = await send(id, order)
    if (outcome === "failed") return
    removed(outcome)
    if (focusIsFree()) focusAfterRemoval(order, id)
  }

  function open(policy: InsurancePolicy): void {
    if (policy.deleted || policy.id === null || sending.current.has(policy.id)) return
    focusOnClose.current = null
    setConfirming({ open: true, id: policy.id, name: insurancePolicyName(policy) })
  }

  const close = (): void => setConfirming((current) => (current ? { ...current, open: false } : current))

  /** Confirm: the dialog stays open and busy until the outcome and the list read, then closes. */
  async function confirmDelete(): Promise<void> {
    if (!confirming?.open || busy) return
    const { id } = confirming
    const order = activeOrder()
    setBusy(true)
    let outcome: DeleteOutcome = "failed"
    try {
      outcome = await send(id, order)
    } finally {
      // Whatever happens, the dialog never stays open and busy.
      focusOnClose.current = outcome === "failed" ? null : () => focusAfterRemoval(order, id)
      setBusy(false)
      close()
    }
    removed(outcome)
  }

  const dialog: ConfirmDialogProps = {
    open: confirming?.open ?? false,
    variant: "destructive",
    title: INSURANCE_MESSAGES.deleteTitle,
    body: confirming ? formatMessage(INSURANCE_MESSAGES.deleteBody, { policy: confirming.name }) : null,
    confirmLabel: INSURANCE_MESSAGES.deleteConfirm,
    busy,
    busyLabel: INSURANCE_MESSAGES.deleting,
    onConfirm: () => void confirmDelete(),
    onCancel: () => {
      if (!busy) close()
    },
    onCloseFocus: () => {
      const move = focusOnClose.current
      focusOnClose.current = null
      return move ? move() : false
    },
  }

  return { open, isDeleting: (policyId) => deleting.has(policyId), kebabRef, dialog }
}
