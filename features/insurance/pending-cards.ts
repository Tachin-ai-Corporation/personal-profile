import { useSyncExternalStore } from "react"
import type { InsuranceCardSide } from "@/lib/api"

/**
 * Card images whose upload failed in this session (Story 5.3, decision 2A),
 * kept for the card's "Retry upload". Memory only: a module-level map, never
 * storage, so a reload forgets them (the card then shows 5.1's plain "Image
 * not uploaded" tile and the image is added through Edit). An entry goes
 * once its image uploads, is rejected, or its policy is deleted (Story 5.5).
 */
export interface InsurancePendingCard {
  /** The re-encoded JPEG; `null` once it is gone (Retry then opens the side's file picker). */
  readonly blob: Blob | null
  /** The chosen file's name (the upload part name and the messages). */
  readonly name: string
  /** A replaced card's old file id (from the edited policy): deleted once the new image uploads. */
  readonly oldFileId: number | null
}

const store = new Map<string, InsurancePendingCard>()
const listeners = new Set<() => void>()

const keyOf = (policyId: number, side: InsuranceCardSide): string => `${policyId}:${side}`

function changed(): void {
  for (const listener of listeners) listener()
}

/** The pending image of a policy's side, if its upload failed in this session. */
export function insurancePendingCard(policyId: number, side: InsuranceCardSide): InsurancePendingCard | undefined {
  return store.get(keyOf(policyId, side))
}

/** Keeps a failed upload for "Retry upload" (replacing any earlier one of that side). */
export function setInsurancePendingCard(policyId: number, side: InsuranceCardSide, card: InsurancePendingCard): void {
  store.set(keyOf(policyId, side), card)
  changed()
}

/** Forgets a side's pending image (it uploaded, or was rejected). */
export function dropInsurancePendingCard(policyId: number, side: InsuranceCardSide): void {
  if (store.delete(keyOf(policyId, side))) changed()
}

/** Forgets every pending image of a policy (Story 5.5 deletes a policy). */
export function dropInsurancePendingCards(policyId: number): void {
  const prefix = `${policyId}:`
  let any = false
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) any = store.delete(key) || any
  }
  if (any) changed()
}

/** Forgets every pending image (tests). */
export function clearInsurancePendingCards(): void {
  if (store.size === 0) return
  store.clear()
  changed()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The pending image of a side, kept current (a card re-renders when it is set or dropped). `null` policy: none. */
export function useInsurancePendingCard(policyId: number | null, side: InsuranceCardSide): InsurancePendingCard | undefined {
  const read = (): InsurancePendingCard | undefined => (policyId === null ? undefined : store.get(keyOf(policyId, side)))
  return useSyncExternalStore(subscribe, read, () => undefined)
}
