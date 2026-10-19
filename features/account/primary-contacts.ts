import type { ContactPoint } from "@/lib/api"
import type { DraftValues } from "@/features/shell"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import type { AccountFormValues } from "./schema"

export type PrimaryContactKind = "Email" | "Mobile"
export interface PrimaryOption { readonly value: string; readonly label: string; readonly region: string }
export interface PrimaryContactLists { readonly email?: readonly ContactPoint[]; readonly mobile?: readonly ContactPoint[] }
const match = (kind: PrimaryContactKind, value: string): string => kind === "Email" ? value.toLowerCase() : value
export const samePrimary = (kind: PrimaryContactKind, a: string, b: string): boolean => match(kind, a) === match(kind, b)

/** Current is separate from alternatives, including when it is unverified. */
export function primaryOptions(kind: PrimaryContactKind, current: string, rows?: readonly ContactPoint[]): readonly PrimaryOption[] {
  const seen = new Set([match(kind, current)])
  return (rows ?? []).flatMap((row) => {
    const value = row.value?.trim()
    if (!value || !row.isVerified || (row.type !== null && row.type !== kind) || seen.has(match(kind, value))) return []
    seen.add(match(kind, value))
    const region = row.phoneNumberRegion || "us"
    return [{ value, label: kind === "Email" ? value : formatPhoneDisplay(value, region), region }]
  })
}

export function primarySelection(kind: PrimaryContactKind, value: string, current: string, rows?: readonly ContactPoint[]): PrimaryOption | undefined {
  return primaryOptions(kind, current, rows).find((option) => samePrimary(kind, option.value, value))
}

/** Called only on explicit Restore; no metadata or verification state enters drafts. */
export function restorePrimaryDraft(draft: DraftValues, baseline: AccountFormValues, lists: PrimaryContactLists): DraftValues | null {
  const restored = { ...draft }
  for (const [field, kind, rows] of [["primaryEmail", "Email", lists.email], ["primaryPhone", "Mobile", lists.mobile]] as const) {
    const value = draft[field]
    if (typeof value !== "string" || samePrimary(kind, value, baseline[field])) continue
    if (rows === undefined) return null
    if (!primarySelection(kind, value, baseline[field], rows)) restored[field] = baseline[field]
  }
  return restored
}
