/**
 * Insurance (Story 5.1): the pure display rules of a policy card. The
 * platform's values come from `lib/api/insurance.ts` (`InsurancePolicy`)
 * unformatted; everything shown is decided here.
 */

import type { KeyValueRow } from "@/features/shell"
import type { InsuranceCardSide, InsurancePolicy, Myself } from "@/lib/api"
import { wireToDisplayDate } from "@/lib/shared/dates"
import { isNotProvided, joinProvided } from "@/lib/shared/display-value"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"

/**
 * The backend stores a missing Expiration or Cancellation date as this date
 * (never the Effective date, which is required; epic 5 open decision 5: to
 * confirm on demo, `deferred-work.md`). Kept here, insurance-local:
 * extending `isNotProvided` would be a foundation PR.
 */
export const INSURANCE_NO_DATE = "1970-01-01"

/** The enum constant the platform sends for "no value" (`InsuranceConstants.*.N_A`). */
const NOT_APPLICABLE = "N_A"

/** The relationship whose subscriber is the user (`RelationshipToInsured.SELF`). */
const SELF = "SELF"

/** The precedence shown with the filled Primary chip. */
const PRIMARY = "PRIMARY"

/** Which policy dates the backend fills with `INSURANCE_NO_DATE` when missing. */
export type InsuranceDateKind = "effective" | "optional"

/**
 * A policy date as a real `YYYY-MM-DD` date, or `null` when it is not one
 * (empty, `"n/a"`, malformed, a timestamp) or, for an `optional` date
 * (Expiration, Cancellation), the backend's `1970-01-01` sentinel. The
 * Story 5.2 editor loads a date through this too, so the sentinel never
 * reaches the date rules.
 */
export function insuranceWireDate(value: string | null, kind: InsuranceDateKind = "optional"): string | null {
  const trimmed = value?.trim() ?? ""
  if (wireToDisplayDate(trimmed) === null) return null
  return kind === "optional" && trimmed === INSURANCE_NO_DATE ? null : trimmed
}

/** A policy date as `MM/DD/YYYY`, or `null` ("Not provided") as `insuranceWireDate` decides. */
export function insuranceDisplayDate(value: string | null, kind: InsuranceDateKind = "optional"): string | null {
  return wireToDisplayDate(insuranceWireDate(value, kind))
}

/**
 * A platform enum constant in title case (`MEDICAL` → "Medical",
 * `SUPPLEMENTAL` → "Supplemental"), or `null` for `N_A`, blank or missing.
 */
export function insuranceEnumLabel(value: string | null): string | null {
  if (value === null || isNotProvided(value)) return null
  const name = value.trim()
  if (name === NOT_APPLICABLE) return null
  const words = name.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "{Type} Insurance" (e.g. "Medical Insurance"), or "Insurance" without a type. */
export function insurancePolicyTitle(policy: InsurancePolicy): string {
  const type = insuranceEnumLabel(policy.type)
  return type ? formatMessage(INSURANCE_MESSAGES.policyTitle, { type }) : SHELL_MESSAGES.profileTabInsurance
}

/** "{Insurer} {Type} Insurance" (the kebab's and the viewer's name), or the title without an insurer. */
export function insurancePolicyName(policy: InsurancePolicy): string {
  const title = insurancePolicyTitle(policy)
  return isNotProvided(policy.insurer) ? title : formatMessage(INSURANCE_MESSAGES.policyName, { insurer: (policy.insurer ?? "").trim(), policy: title })
}

export interface InsuranceChip {
  readonly variant: "primary" | "label" | "deleted"
  readonly label: string
}

/**
 * The title row's chip: "Deleted" on a deleted policy; else the filled
 * Primary chip, or the `label` chip for any other precedence (Secondary,
 * Supplemental, Other); no chip for `N_A` or none.
 */
export function insuranceChip(policy: InsurancePolicy): InsuranceChip | null {
  if (policy.deleted) return { variant: "deleted", label: INSURANCE_MESSAGES.deleted }
  if (policy.precedence?.trim() === PRIMARY) return { variant: "primary", label: COMMON_MESSAGES.primary }
  const label = insuranceEnumLabel(policy.precedence)
  return label ? { variant: "label", label } : null
}

/**
 * The Subscriber value: the user's own first + last name when the
 * relationship is Self (the platform's subscriber name while `myself` isn't
 * there), else the subscriber's first + last name; `null` reads "Not provided".
 */
export function insuranceSubscriberName(policy: InsurancePolicy, myself: Myself | undefined): string | null {
  const subscriber = joinProvided([policy.subscriber?.firstName, policy.subscriber?.lastName])
  const own = policy.relationship?.trim() === SELF ? joinProvided([myself?.firstName, myself?.lastName]) : ""
  return own || subscriber || null
}

/** The key/value grid, two pairs per row: Insurer, Subscriber, Member ID, Effective, Group ID, Expiration, Cancellation. */
export function insuranceGridRows(policy: InsurancePolicy, myself: Myself | undefined): KeyValueRow[] {
  return [
    { key: "insurer", label: INSURANCE_MESSAGES.insurer, value: policy.insurer },
    { key: "subscriber", label: INSURANCE_MESSAGES.subscriber, value: insuranceSubscriberName(policy, myself) },
    { key: "memberId", label: INSURANCE_MESSAGES.memberId, value: policy.memberId },
    { key: "effective", label: INSURANCE_MESSAGES.effective, value: insuranceDisplayDate(policy.effectiveDate, "effective") },
    { key: "groupId", label: INSURANCE_MESSAGES.groupId, value: policy.groupId },
    { key: "expiration", label: INSURANCE_MESSAGES.expiration, value: insuranceDisplayDate(policy.expirationDate) },
    { key: "cancellation", label: INSURANCE_MESSAGES.cancellation, value: insuranceDisplayDate(policy.cancellationDate) },
  ]
}

/** Active policies first, then Deleted ones; otherwise the platform order. */
export function sortInsurancePolicies(policies: readonly InsurancePolicy[]): InsurancePolicy[] {
  return [...policies.filter((policy) => !policy.deleted), ...policies.filter((policy) => policy.deleted)]
}

/** The header count: the policies that are not Deleted. */
export function insuranceActiveCount(policies: readonly InsurancePolicy[]): number {
  return policies.filter((policy) => !policy.deleted).length
}

/** A card side's caption ("Front" / "Back"). */
export function insuranceSideLabel(side: InsuranceCardSide): string {
  return side === "front" ? INSURANCE_MESSAGES.front : COMMON_MESSAGES.back
}
