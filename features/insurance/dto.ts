/**
 * Insurance editor (Story 5.2): a saved policy as the form's opening values,
 * and the form values as the policy the save sends (`InsurancePolicyInput`;
 * `lib/api/insurance.ts` builds the `InsuranceDTO` from it).
 */

import type { InsurancePolicy, InsurancePolicyInput, InsurancePrecedence, InsuranceRelationship, InsuranceSubscriber, InsuranceSubscriberInput, InsuranceType } from "@/lib/api"
import { displayToWireDate, wireToDisplayDate } from "@/lib/shared/dates"
import { isNotProvided } from "@/lib/shared/display-value"
import { EMPTY_PHONE_INPUT, phoneInputFrom, toE164 } from "@/lib/shared/phone"
import { insuranceEnumLabel, insuranceWireDate } from "./format"
import { needsSubscriber, type InsuranceFormValues } from "./schema"

/** A platform value as form text: `""` for missing, blank or `"n/a"`. */
const provided = (value: string | null): string => (value === null || isNotProvided(value) ? "" : value.trim())

/** A platform enum as the form's choice: the constant, or `""` for `N_A` / none. */
const choice = (value: string | null): string => (insuranceEnumLabel(value) === null ? "" : (value ?? "").trim())

/** A wire date as the date input's text (`MM/DD/YYYY`), or `""`. */
const displayDate = (wire: string | null): string => wireToDisplayDate(wire) ?? ""

/** A new policy's form: nothing chosen, nothing typed. */
export const EMPTY_INSURANCE_FORM: InsuranceFormValues = {
  insurer: null,
  type: "",
  precedence: "",
  relationship: "",
  memberId: "",
  groupId: "",
  effectiveDate: "",
  expirationDate: "",
  cancellationDate: "",
  subscriberFirstName: "",
  subscriberLastName: "",
  subscriberEmail: "",
  subscriberPhone: EMPTY_PHONE_INPUT,
  subscriberBirthDate: "",
}

/**
 * The saved subscriber of a policy saved with a relationship other than Self
 * (decision 2C): read-only in the editor and sent back unchanged. `null` for
 * a new policy, a Self (or `N_A`) policy, or one without a subscriber.
 */
export function insuranceLockedSubscriber(policy: InsurancePolicy | null): InsuranceSubscriber | null {
  if (policy === null || !needsSubscriber(choice(policy.relationship))) return null
  return policy.subscriber
}

/**
 * The form's opening values: empty for Add; on Edit, every saved value, with
 * the backend's placeholders (`1970-01-01` Expiration / Cancellation, `"n/a"`
 * Group ID) and `N_A` enums as empty. The insurer is the saved one (by id when
 * it has one). The subscriber fields hold the saved subscriber when the
 * policy has one (shown read-only), else they start empty.
 */
export function toInsuranceFormValues(policy: InsurancePolicy | null): InsuranceFormValues {
  if (policy === null) return EMPTY_INSURANCE_FORM
  const insurerName = provided(policy.insurer)
  const insurerId = policy.insurerId !== null && Number.isSafeInteger(policy.insurerId) && policy.insurerId > 0 ? policy.insurerId : null
  const subscriber = insuranceLockedSubscriber(policy)
  return {
    insurer: insurerName === "" ? null : { id: insurerId, name: insurerName },
    type: choice(policy.type),
    precedence: choice(policy.precedence),
    relationship: choice(policy.relationship),
    memberId: provided(policy.memberId),
    groupId: provided(policy.groupId),
    effectiveDate: displayDate(insuranceWireDate(policy.effectiveDate, "effective")),
    expirationDate: displayDate(insuranceWireDate(policy.expirationDate)),
    cancellationDate: displayDate(insuranceWireDate(policy.cancellationDate)),
    subscriberFirstName: provided(subscriber?.firstName ?? null),
    subscriberLastName: provided(subscriber?.lastName ?? null),
    subscriberEmail: provided(subscriber?.email ?? null),
    subscriberPhone: subscriber ? phoneInputFrom(provided(subscriber.phoneNumber), subscriber.phoneNumberRegion) : EMPTY_PHONE_INPUT,
    subscriberBirthDate: displayDate(insuranceWireDate(subscriber?.birthDate ?? null, "effective")),
  }
}

/** A phone region the backend and the proxy take. */
const REGION = /^[A-Za-z]{2}$/

/** The saved subscriber as sent back (decision 2C): its own values, unchanged; missing ones left out. */
function savedSubscriber(subscriber: InsuranceSubscriber): InsuranceSubscriberInput {
  const phone = provided(subscriber.phoneNumber)
  const birthDate = insuranceWireDate(subscriber.birthDate, "effective")
  return {
    firstName: provided(subscriber.firstName),
    lastName: provided(subscriber.lastName),
    email: provided(subscriber.email),
    ...(phone === "" ? {} : { phoneNumber: phone }),
    // Only a two-letter region (the proxy refuses anything else, e.g. "n/a").
    ...(phone !== "" && REGION.test(subscriber.phoneNumberRegion?.trim() ?? "") ? { phoneNumberRegion: (subscriber.phoneNumberRegion ?? "").trim() } : {}),
    ...(birthDate === null ? {} : { birthDate }),
  }
}

/** The typed subscriber: trimmed names and email, the phone as E.164 with its region, the birth date as `YYYY-MM-DD`. */
function typedSubscriber(values: InsuranceFormValues): InsuranceSubscriberInput {
  const phone = toE164(values.subscriberPhone)
  const birthDate = displayToWireDate(values.subscriberBirthDate.trim())
  return {
    firstName: values.subscriberFirstName.trim(),
    lastName: values.subscriberLastName.trim(),
    email: values.subscriberEmail.trim(),
    ...(phone === null ? {} : { phoneNumber: phone, phoneNumberRegion: values.subscriberPhone.region }),
    ...(birthDate === null ? {} : { birthDate }),
  }
}

/**
 * The policy a save sends, from valid form values: the insurer by id (listed)
 * or name (added), the constants as chosen, the dates as `YYYY-MM-DD` (`""`
 * when empty), and the subscriber only when the relationship isn't Self:
 * the saved one unchanged when it is locked (`locked`), else the typed one,
 * which only an Add sends (`typed`, decision 3A).
 */
export function toInsurancePolicyInput(values: InsuranceFormValues, locked: InsuranceSubscriber | null, typed = true): InsurancePolicyInput {
  const insurer = values.insurer
  let subscriber: InsurancePolicyInput["subscriber"] = null
  if (needsSubscriber(values.relationship)) subscriber = locked ? savedSubscriber(locked) : typed ? typedSubscriber(values) : null
  return {
    insurer: insurer && insurer.id !== null ? { id: insurer.id } : { name: (insurer?.name ?? "").trim() },
    type: values.type as InsuranceType,
    precedence: values.precedence as InsurancePrecedence,
    relationship: values.relationship as InsuranceRelationship,
    memberId: values.memberId.trim(),
    groupId: values.groupId.trim(),
    effectiveDate: displayToWireDate(values.effectiveDate.trim()) ?? "",
    expirationDate: displayToWireDate(values.expirationDate.trim()) ?? "",
    cancellationDate: displayToWireDate(values.cancellationDate.trim()) ?? "",
    subscriber,
  }
}
