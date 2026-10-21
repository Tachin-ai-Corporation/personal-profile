/**
 * Insurance (Story 5.4, FR29, NG-9029): one Primary policy per type. The
 * backend refuses a second Active Primary of a type (`validatePrimaryInsurance`:
 * on every `POST`, and on a `PUT` that makes a policy Primary or changes its
 * type), so the editor offers to make the other policy (or, with legacy data,
 * policies) Secondary first, and saves that demotion before the policy
 * (decision 1A). Pure rules: the conflict and the demotion's body.
 */

import type { InsurancePolicy, InsurancePolicyInput, InsurancePrecedence } from "@/lib/api"
import { isNotProvided } from "@/lib/shared/display-value"
import { formatMessage, INSURANCE_MESSAGES } from "@/lib/shared/messages"
import { insuranceLockedSubscriber, toInsuranceFormValues, toInsurancePolicyInput } from "./dto"
import { insurancePolicyTitle } from "./format"
import { insuranceSchema, needsSubscriber } from "./schema"

const PRIMARY = "PRIMARY" satisfies InsurancePrecedence
const SECONDARY = "SECONDARY" satisfies InsurancePrecedence

const isPositiveId = (id: number | null): id is number => id !== null && Number.isSafeInteger(id) && id > 0

/** An Active (not Deleted) Primary policy of `type`: the only kind the backend counts. */
function isActivePrimaryOf(policy: InsurancePolicy, type: string): boolean {
  return !policy.deleted && policy.precedence?.trim() === PRIMARY && policy.type?.trim() === type
}

/**
 * The policies a save of the editor's Type + Precedence would clash with:
 * when the form's Precedence is Primary and its Type is `type`, every
 * non-Deleted Primary policy of that type in `policies` other than the one
 * being edited (`editingId`; `null` for Add). Legacy data may hold several.
 * Editing the current Primary without changing its type clashes with nothing
 * (the backend doesn't check that `PUT`); changing its type does.
 */
export function insurancePrimaryConflicts(
  policies: readonly InsurancePolicy[] | undefined,
  editingId: number | null,
  type: string,
  precedence: string,
): InsurancePolicy[] {
  if (precedence !== PRIMARY || type === "" || policies === undefined) return []
  const edited = editingId === null ? undefined : policies.find((policy) => policy.id === editingId)
  if (edited !== undefined && isActivePrimaryOf(edited, type)) return []
  return policies.filter((policy) => isActivePrimaryOf(policy, type) && (editingId === null || policy.id !== editingId))
}

/**
 * The demotion of a conflicting policy (`PUT v2/health/patient/insurance/{id}`,
 * a full replace): its saved values through 5.2's builders, with its saved
 * subscriber locked and unchanged (never typed, decisions 2C / 3A) and only
 * the precedence changed (Secondary by default; Primary re-promotes it,
 * decision 2A). `null` when its saved values can't make a valid body (no
 * usable id, an `N_A` or missing value, a missing Member ID, dates out of
 * order, a non-Self policy without a saved subscriber): nothing is sent then.
 */
export function insuranceDemotionInput(policy: InsurancePolicy, precedence: InsurancePrecedence = SECONDARY): InsurancePolicyInput | null {
  if (!isPositiveId(policy.id)) return null
  const values = { ...toInsuranceFormValues(policy), precedence }
  const locked = insuranceLockedSubscriber(policy)
  if (insuranceDemotionLacksPolicyholder(policy)) return null
  // `subscriberLocked: true` skips every subscriber rule, and only those read `today` (the age) and `ownEmail`,
  // so the fixed `new Date(0)` can't change the outcome: the body never depends on the current date.
  if (!insuranceSchema({ ownEmail: null, subscriberLocked: true, today: new Date(0) }).safeParse(values).success) return null
  return toInsurancePolicyInput(values, locked, false)
}

/**
 * A non-Self policy saved without a subscriber: its demotion can never be sent
 * (an Edit never types a subscriber, decision 3A), so the user is told to
 * remove that policy and add it again rather than to edit it.
 */
export function insuranceDemotionLacksPolicyholder(policy: InsurancePolicy): boolean {
  return needsSubscriber(toInsuranceFormValues(policy).relationship) && insuranceLockedSubscriber(policy) === null
}

/** A policy's insurer as the banner names it, or its title ("Medical Insurance") without one. */
export function insuranceConflictName(policy: InsurancePolicy): string {
  return isNotProvided(policy.insurer) ? insurancePolicyTitle(policy) : (policy.insurer ?? "").trim()
}

/** Several insurers as one name, each once: "Aetna", "Aetna and Cigna", "Aetna, Cigna and Humana". */
export function insuranceJoinNames(names: readonly string[]): string {
  const unique = [...new Set(names)]
  if (unique.length <= 1) return unique[0] ?? ""
  return formatMessage(INSURANCE_MESSAGES.insurerList, { insurers: unique.slice(0, -1).join(INSURANCE_MESSAGES.insurerListSeparator), last: unique[unique.length - 1] })
}
