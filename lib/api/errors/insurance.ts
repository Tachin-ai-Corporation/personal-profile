import type { MessageKey } from "@/lib/shared/messages"
import type { MessageRule } from "./core"

/**
 * Fields of the Insurance editor (Story 5.2) the table can name: the form's
 * fields, plus `policy` (the policy itself is gone: no single field holds
 * it, so the editor shows it at drawer level, like Contacts' `primary`;
 * Story 5.5's delete treats it as already removed, `isInsurancePolicyGone`).
 */
export type Field =
  | "insurer"
  | "type"
  | "precedence"
  | "relationship"
  | "memberId"
  | "groupId"
  | "effective"
  | "expiration"
  | "cancellation"
  | "subscriberFirstName"
  | "subscriberLastName"
  | "subscriberEmail"
  | "subscriberPhone"
  | "subscriberBirthDate"
  | "policy"

/** A field rule of the Insurance Section only. */
const field = (pattern: RegExp, target: Field, messageKey: MessageKey): MessageRule<Field> => ({
  scopes: ["insurance"],
  pattern,
  result: { kind: "field", field: target, messageKey },
})

/**
 * Insurance (Story 5.2): the backend's exact texts for a policy `POST` /
 * `PUT` (`bo-core common/Messages.java` 933–963, `OneHealthServiceImpl`
 * `validateInsuranceDTO`, `validateSubscriber`, `validatePrimaryInsurance`,
 * `fetchInsuranceOrganization`; `StringUtil` length texts with the attribute
 * names "Member Id Number" and "Group Number"; `INVALID_PHONE_PROVIDED` in the
 * common util `Messages`). Anything else is the drawer's generic error.
 */
export const rules: readonly MessageRule<Field>[] = [
  // Member ID and Group ID: 3–32 characters (`INSURANCE_UNIQUE_CONSTRAINTS_*_LEN`), required Member ID.
  field(/^Member Id Number is missing\.$/, "memberId", "insurance.memberIdRequired"),
  field(/^Member Id Number (should be at least 3|cannot exceed 32) symbols\.$/, "memberId", "insurance.memberIdLength"),
  field(/^Group Number (should be at least 3|cannot exceed 32) symbols\.$/, "groupId", "insurance.groupIdLength"),
  // The duplicate: the same insurer and Member ID on another policy (POST `PATIENT_ALREADY_HAS_INSURANCE`, PUT `INSURANCE_UPDATE_ERROR`).
  field(
    /^Patient with ID \{\d+\} already has an existing insurance record associated with Insurance Company ID \{\d+\} and Policy Number \{.*\}$/,
    "memberId",
    "insurance.duplicatePolicy",
  ),
  field(
    /^Unable to update insurance\. There is already an existing insurance record associated with Insurance Company ID \{\d+\} and Policy Number \{.*\}$/,
    "memberId",
    "insurance.duplicatePolicy",
  ),
  // One Primary per type (`PRIMARY_INSURANCE_ALREADY_EXIST`): on Precedence. Story 5.4's demotion offer avoids it; it still shows
  // there for a race (another device made a Primary meanwhile).
  field(/^You can not have multiple insurance records from same type with precedence field set to Primary\.$/, "precedence", "insurance.primaryTaken"),
  // The subscriber (Relationship ≠ Self).
  field(/^Please provide subscriber's first name\.$/, "subscriberFirstName", "person.firstNameRequired"),
  field(/^Please provide subscriber's last name\.$/, "subscriberLastName", "person.lastNameRequired"),
  field(/^First name cannot exceed 24 characters\.$/, "subscriberFirstName", "person.firstNameTooLong"),
  field(/^Last name cannot exceed 24 characters\.$/, "subscriberLastName", "person.lastNameTooLong"),
  field(/^Please provide subscriber's email\.$/, "subscriberEmail", "insurance.subscriberEmailRequired"),
  field(/^.* is not valid email\.$/, "subscriberEmail", "contacts.emailInvalid"),
  field(/^Invalid phone number provided \{.*\}\.$/, "subscriberPhone", "section.phoneInvalid"),
  field(/^Please, provide subscriber's birth date\.$/, "subscriberBirthDate", "person.birthDateRequired"),
  field(/^Invalid date of birth\. The patient should be between 18 and 120 years old\.$/, "subscriberBirthDate", "insurance.subscriberAge"),
  // A listed insurer that no longer exists (`INSURANCE_ORGANIZATION_WITH_ID_IS_MISSING`).
  field(/^Operation failed\. Insurance Company with ID: \d+ does not exist\.$/, "insurer", "insurance.insurerMissing"),
  // The policy is no longer the user's (`MISSING_PATIENT_INSURANCE`): drawer level. Story 5.5's delete counts it as already removed.
  field(/^Patient with id: \{\d+\} does not have an insurance with id: \{\d+\}$/, "policy", "insurance.policyMissing"),
  // Story 5.5 (decision 1B), the policy delete (`AbstractInsuranceDeleteFactory`): the policy isn't found joined to the caller
  // (`TYPE_INSTANCE_NOT_FOUND` with the type key "Insurance"), or it is already Deleted (`INSURANCE_ALREADY_DELETED`). Like the
  // rule above, both mean the policy is gone (`policy`): the editor (5.2) and the demotion (5.4) show their policy-gone handling,
  // and the delete its own "This policy was already removed." toast (`isInsurancePolicyGone`).
  field(/^Insurance with id: \d+ not found\.$/, "policy", "insurance.policyMissing"),
  field(/^Insurance with Id: \d+ is already deleted\.$/, "policy", "insurance.policyMissing"),
]
