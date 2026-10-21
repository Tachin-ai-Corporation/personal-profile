import { z } from "zod"
import { INSURANCE_PRECEDENCES, INSURANCE_RELATIONSHIPS, INSURANCE_SELF, INSURANCE_TYPES } from "@/lib/api"
import { displayToWireDate } from "@/lib/shared/dates"
import { CONTACT_MESSAGES, INSURANCE_MESSAGES, PERSON_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { isBirthDateInRange, nameIssue } from "@/lib/shared/person-rules"
import { phoneIssue, type PhoneInputValue } from "@/lib/shared/phone"

/**
 * The Insurance editor (Story 5.2, FR29, NG-9029): its form values and rules
 * (zod 4; every message is catalog copy). Checked on blur and on Save;
 * nothing is sent while anything is invalid.
 */

/** The picked insurer: a listed one (`id`), or one added by name ("Add “{name}”", `id: null`). */
export interface InsurerValue {
  readonly id: number | null
  readonly name: string
}

/**
 * The form values: text as typed; the enums as the platform's constants
 * (`""` when none is chosen); the dates as the date inputs show them
 * (`MM/DD/YYYY`, or partial while typing), so the rules can tell "required"
 * from "Enter a date as MM/DD/YYYY"; the subscriber's phone as the phone
 * input holds it.
 */
export interface InsuranceFormValues {
  readonly insurer: InsurerValue | null
  readonly type: string
  readonly precedence: string
  readonly relationship: string
  readonly memberId: string
  readonly groupId: string
  readonly effectiveDate: string
  readonly expirationDate: string
  readonly cancellationDate: string
  readonly subscriberFirstName: string
  readonly subscriberLastName: string
  readonly subscriberEmail: string
  readonly subscriberPhone: PhoneInputValue
  readonly subscriberBirthDate: string
}

export type InsuranceFormField = keyof InsuranceFormValues

/** Every field in the drawer's reading order (first-invalid focus). */
export const INSURANCE_FIELD_ORDER: readonly InsuranceFormField[] = [
  "insurer",
  "type",
  "precedence",
  "relationship",
  "memberId",
  "groupId",
  "effectiveDate",
  "expirationDate",
  "cancellationDate",
  "subscriberFirstName",
  "subscriberLastName",
  "subscriberEmail",
  "subscriberPhone",
  "subscriberBirthDate",
]

/** Member ID and Group ID: 3–32 characters after trimming (`InsuranceConstants.INSURANCE_UNIQUE_CONSTRAINTS_*_LEN`). */
export const INSURANCE_ID_MIN_LENGTH = 3
export const INSURANCE_ID_MAX_LENGTH = 32

/** What the rules need besides the values. */
export interface InsuranceSchemaContext {
  /** The user's own (primary) email (`myself.email`): a subscriber may not use it. */
  readonly ownEmail: string | null | undefined
  /** An Edit (decisions 2C, 3A): the subscriber is never typed (locked or absent), so its fields skip the rules. */
  readonly subscriberLocked: boolean
  /** "Today" for the subscriber's age. */
  readonly today: Date
}

/** Whether the relationship asks for a subscriber (a backend relationship other than Self). */
export function needsSubscriber(relationship: string): boolean {
  return relationship !== INSURANCE_SELF && (INSURANCE_RELATIONSHIPS as readonly string[]).includes(relationship)
}

/** A date input's text: empty, a real date (`YYYY-MM-DD`), or not a date. */
type DateText = { readonly kind: "empty" } | { readonly kind: "date"; readonly wire: string } | { readonly kind: "invalid" }

function dateText(text: string): DateText {
  if (text.trim() === "") return { kind: "empty" }
  const wire = displayToWireDate(text.trim())
  return wire === null ? { kind: "invalid" } : { kind: "date", wire }
}

const idLength = (value: string): boolean => {
  const length = Array.from(value.trim()).length
  return length >= INSURANCE_ID_MIN_LENGTH && length <= INSURANCE_ID_MAX_LENGTH
}

const isEmail = (value: string): boolean => z.email().safeParse(value).success

const NAME_MESSAGES = {
  subscriberFirstName: { required: PERSON_MESSAGES.firstNameRequired, tooLong: PERSON_MESSAGES.firstNameTooLong },
  subscriberLastName: { required: PERSON_MESSAGES.lastNameRequired, tooLong: PERSON_MESSAGES.lastNameTooLong },
} as const

const PHONE_MESSAGES = {
  required: INSURANCE_MESSAGES.subscriberPhoneRequired,
  tenDigits: CONTACT_MESSAGES.phoneTenDigits,
  invalid: SECTION_MESSAGES.phoneInvalid,
} as const

const formShape = z.object({
  insurer: z.object({ id: z.number().nullable(), name: z.string() }).nullable(),
  type: z.string(),
  precedence: z.string(),
  relationship: z.string(),
  memberId: z.string(),
  groupId: z.string(),
  effectiveDate: z.string(),
  expirationDate: z.string(),
  cancellationDate: z.string(),
  subscriberFirstName: z.string(),
  subscriberLastName: z.string(),
  subscriberEmail: z.string(),
  subscriberPhone: z.object({ region: z.string(), national: z.string() }),
  subscriberBirthDate: z.string(),
})

/**
 * The editor's rules (spec 5.2 Validation): Insurer, Type, Precedence,
 * Relationship, Member ID and Effective date are required; Member ID 3–32
 * characters, Group ID too when filled; Expiration and Cancellation after
 * Effective and Cancellation before Expiration; and, when the relationship
 * isn't Self and the subscriber isn't locked, the subscriber's names (up to
 * 24), email (valid, not the user's own), phone and birth date (age 18–120).
 */
export function insuranceSchema(context: InsuranceSchemaContext): z.ZodType<InsuranceFormValues, InsuranceFormValues> {
  return formShape.superRefine((values, ctx) => {
    const issue = (path: InsuranceFormField, message: string): void => {
      ctx.addIssue({ code: "custom", path: [path], message })
    }
    if (values.insurer === null || values.insurer.name.trim() === "") issue("insurer", INSURANCE_MESSAGES.insurerRequired)
    if (!(INSURANCE_TYPES as readonly string[]).includes(values.type)) issue("type", PERSON_MESSAGES.chooseValue)
    if (!(INSURANCE_PRECEDENCES as readonly string[]).includes(values.precedence)) issue("precedence", PERSON_MESSAGES.chooseValue)
    if (!(INSURANCE_RELATIONSHIPS as readonly string[]).includes(values.relationship)) issue("relationship", PERSON_MESSAGES.chooseValue)

    if (values.memberId.trim() === "") issue("memberId", INSURANCE_MESSAGES.memberIdRequired)
    else if (!idLength(values.memberId)) issue("memberId", INSURANCE_MESSAGES.memberIdLength)
    if (values.groupId.trim() !== "" && !idLength(values.groupId)) issue("groupId", INSURANCE_MESSAGES.groupIdLength)

    const effective = dateText(values.effectiveDate)
    const expiration = dateText(values.expirationDate)
    const cancellation = dateText(values.cancellationDate)
    if (effective.kind === "empty") issue("effectiveDate", INSURANCE_MESSAGES.effectiveRequired)
    if (effective.kind === "invalid") issue("effectiveDate", PERSON_MESSAGES.birthDateFormat)
    if (expiration.kind === "invalid") issue("expirationDate", PERSON_MESSAGES.birthDateFormat)
    if (cancellation.kind === "invalid") issue("cancellationDate", PERSON_MESSAGES.birthDateFormat)
    // `YYYY-MM-DD` strings compare in calendar order.
    if (expiration.kind === "date" && effective.kind === "date" && expiration.wire <= effective.wire) {
      issue("expirationDate", INSURANCE_MESSAGES.expirationAfterEffective)
    }
    if (cancellation.kind === "date" && effective.kind === "date" && cancellation.wire <= effective.wire) {
      issue("cancellationDate", INSURANCE_MESSAGES.cancellationAfterEffective)
    } else if (cancellation.kind === "date" && expiration.kind === "date" && cancellation.wire >= expiration.wire) {
      issue("cancellationDate", INSURANCE_MESSAGES.cancellationBeforeExpiration)
    }

    if (!needsSubscriber(values.relationship) || context.subscriberLocked) return
    for (const field of ["subscriberFirstName", "subscriberLastName"] as const) {
      const name = nameIssue(values[field])
      if (name === "required" || name === "tooLong") issue(field, NAME_MESSAGES[field][name])
      else if (name === "notPrintable") issue(field, PERSON_MESSAGES.notPrintable)
    }
    const email = values.subscriberEmail.trim()
    if (email === "") issue("subscriberEmail", INSURANCE_MESSAGES.subscriberEmailRequired)
    else if (!isEmail(email)) issue("subscriberEmail", CONTACT_MESSAGES.emailInvalid)
    else if (email.toLowerCase() === (context.ownEmail ?? "").trim().toLowerCase()) issue("subscriberEmail", INSURANCE_MESSAGES.subscriberEmailOwn)
    const phone = phoneIssue(values.subscriberPhone)
    if (phone !== null) issue("subscriberPhone", PHONE_MESSAGES[phone])
    const birth = dateText(values.subscriberBirthDate)
    if (birth.kind === "empty") issue("subscriberBirthDate", PERSON_MESSAGES.birthDateRequired)
    else if (birth.kind === "invalid") issue("subscriberBirthDate", PERSON_MESSAGES.birthDateFormat)
    else if (!isBirthDateInRange(birth.wire, [], context.today)) issue("subscriberBirthDate", INSURANCE_MESSAGES.subscriberAge)
  })
}
