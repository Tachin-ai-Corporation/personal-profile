import { z } from "zod"
import type { DraftDiffRow, DraftValues } from "@/features/shell"
import type { Myself, PersonalInformationPayload } from "@/lib/api"
import { displayToWireDate, wireToDisplayDate } from "@/lib/shared/dates"
import { isNotProvided } from "@/lib/shared/display-value"
import { FIELD_MESSAGES, formatMessage, PERSON_MESSAGES } from "@/lib/shared/messages"
import {
  birthDateAgeRange,
  isBirthDateInRange,
  NAME_MAX_LENGTH,
  nameIssue,
  normalizeName,
  PREFIX_SUFFIX_MAX_LENGTH,
  SHORT_TEXT_MAX_LENGTH,
  textIssue,
  type NameIssue,
} from "@/lib/shared/person-rules"
import { isCompleteSsn, toSsnFormValue } from "./ssn"

/**
 * Personal information edit view (Story 2.2, FR12, NG-9022): the form values,
 * their rules (on the shared `person-rules.ts`; copy from `PERSON_MESSAGES`),
 * the changed-fields diff the save sends and the draft wiring. The SSN
 * (Story 2.3) is the 15th form value but never a draft field; Signature
 * (2.4) is not a form value here. Neither can ever be drafted.
 */

/** The 14 edited fields in the F1 order: the form values, the draft fields and the first-invalid focus order. */
export const PERSONAL_DRAFT_FIELDS = [
  "namePrefix",
  "firstName",
  "middleName",
  "lastName",
  "nameSuffix",
  "otherNames",
  "titles",
  "birthDate",
  "cityOfBirth",
  "race",
  "ethnicity",
  "biologicalGender",
  "genderIdentity",
  "sexualOrientation",
] as const

export type PersonalField = (typeof PERSONAL_DRAFT_FIELDS)[number]

/** The SSN form field (Story 2.3): never a draft field (`DRAFT_DENYLIST`). */
export const SSN_FIELD = "socialSecurityNumber"

/** Every form field in reading order (first-invalid focus): the 14 draft fields, then the SSN. */
export const PERSONAL_FIELD_ORDER = [...PERSONAL_DRAFT_FIELDS, SSN_FIELD] as const

/**
 * The form values: text as typed, `""` when not provided. `birthDate` is the
 * date input's shown text (`MM/DD/YYYY`, or partial while typing), so the
 * schema can tell "required" from "Enter a date as MM/DD/YYYY"; the diff
 * sends it as `YYYY-MM-DD`. `socialSecurityNumber` is the saved mask
 * (untouched), `""` (none, or cleared) or the typed `XXX-XX-XXXX` text; a
 * revealed SSN never enters it.
 */
export type PersonalValues = Record<PersonalField | typeof SSN_FIELD, string>

/** The fields that may be left empty (muted "(optional)"); a cleared one is sent as `"n/a"`. */
export const PERSONAL_OPTIONAL_FIELDS: ReadonlySet<PersonalField> = new Set<PersonalField>([
  "namePrefix",
  "middleName",
  "nameSuffix",
  "otherNames",
  "titles",
  "cityOfBirth",
  "sexualOrientation",
])

/** The value that clears an optional field on the platform. */
const CLEARED = "n/a"

/** The labels of the edit view and the draft compare (F1 order). */
export const PERSONAL_LABELS: Readonly<Record<PersonalField, string>> = {
  namePrefix: PERSON_MESSAGES.namePrefix,
  firstName: FIELD_MESSAGES.firstName,
  middleName: FIELD_MESSAGES.middleName,
  lastName: FIELD_MESSAGES.lastName,
  nameSuffix: PERSON_MESSAGES.nameSuffix,
  otherNames: PERSON_MESSAGES.otherNames,
  titles: PERSON_MESSAGES.titles,
  birthDate: FIELD_MESSAGES.birthDate,
  cityOfBirth: PERSON_MESSAGES.cityOfBirth,
  race: PERSON_MESSAGES.race,
  ethnicity: PERSON_MESSAGES.ethnicity,
  biologicalGender: PERSON_MESSAGES.biologicalGender,
  genderIdentity: PERSON_MESSAGES.genderIdentity,
  sexualOrientation: PERSON_MESSAGES.sexualOrientation,
}

/** The message for each issue a text field can have (`undefined`: the issue can't occur or is fine). */
type IssueMessages = Partial<Record<NameIssue, string>>

/**
 * The issue of a required text value: the platform's clear sentinels
 * (`n/a` in any case, `-1`) read as empty, so they are never saved as a value.
 */
function requiredIssue(value: string, issue: NameIssue | null): NameIssue | null {
  return isNotProvided(value) ? "required" : issue
}

/**
 * A text field on `textIssue(value, max)`: trimmed first, printable only.
 * An optional field may be empty; a required one may not be a clear sentinel.
 */
function textField(max: number, messages: IssueMessages, optional: boolean) {
  return z.string().superRefine((value, context) => {
    const issue = optional ? textIssue(value, max) : requiredIssue(value, textIssue(value, max))
    if (issue === null || (issue === "required" && optional)) return
    context.addIssue({ code: "custom", message: issue === "notPrintable" ? PERSON_MESSAGES.notPrintable : messages[issue] })
  })
}

/** First or Last name: required, 1–24 characters after trimming (`nameIssue`). */
function nameField(required: string, tooLong: string) {
  return z.string().superRefine((value, context) => {
    const issue = requiredIssue(value, nameIssue(value))
    if (issue === null) return
    const message = issue === "required" ? required : issue === "tooLong" ? tooLong : PERSON_MESSAGES.notPrintable
    context.addIssue({ code: "custom", message })
  })
}

/** A picker (Race, Ethnicity, Biological gender): required. */
const choiceField = () => z.string().trim().min(1, { message: PERSON_MESSAGES.chooseValue })

/** The age rule copy for `roles` ("You must be between 18 and 120 years old"; 21 for Proctor): the Birth date help and its range error. */
export function ageRangeMessage(roles: readonly string[] | null | undefined): string {
  const { min, max } = birthDateAgeRange(roles)
  return formatMessage(PERSON_MESSAGES.ageRange, { min, max })
}

/**
 * The Personal information rules for a user with `roles` on `today`'s local
 * date (Story 2.2): every text trimmed first; First and Last name required
 * (`nameIssue`); Middle name, Other names and Titles optional ≤ 24; prefix
 * and suffix optional ≤ 10; City of birth and Sexual orientation optional
 * ≤ 128; Gender identity required ≤ 128; printable characters only; Birth
 * date required, a real date, and inside the age range (future dates
 * included); Race, Ethnicity and Biological gender required. SSN (Story
 * 2.3): the untouched `ssnMask` (the saved mask, `""` without one; the
 * same value the SSN input compares with), a complete `XXX-XX-XXXX`, or `""`.
 */
export function personalSchema(roles: readonly string[] | null | undefined, today: Date, ssnMask: string) {
  const name: IssueMessages = { tooLong: PERSON_MESSAGES.nameTooLong }
  const prefixSuffix: IssueMessages = { tooLong: PERSON_MESSAGES.prefixSuffixTooLong }
  return z.object({
    namePrefix: textField(PREFIX_SUFFIX_MAX_LENGTH, prefixSuffix, true),
    firstName: nameField(PERSON_MESSAGES.firstNameRequired, PERSON_MESSAGES.firstNameTooLong),
    middleName: textField(NAME_MAX_LENGTH, name, true),
    lastName: nameField(PERSON_MESSAGES.lastNameRequired, PERSON_MESSAGES.lastNameTooLong),
    nameSuffix: textField(PREFIX_SUFFIX_MAX_LENGTH, prefixSuffix, true),
    otherNames: textField(NAME_MAX_LENGTH, name, true),
    titles: textField(NAME_MAX_LENGTH, name, true),
    birthDate: z.string().superRefine((value, context) => {
      const text = normalizeName(value)
      const wire = displayToWireDate(text)
      let message: string | undefined
      if (text === "") message = PERSON_MESSAGES.birthDateRequired
      else if (wire === null) message = PERSON_MESSAGES.birthDateFormat
      else if (!isBirthDateInRange(wire, roles, today)) message = ageRangeMessage(roles)
      if (message !== undefined) context.addIssue({ code: "custom", message })
    }),
    cityOfBirth: textField(SHORT_TEXT_MAX_LENGTH, { tooLong: PERSON_MESSAGES.shortTextTooLong }, true),
    race: choiceField(),
    ethnicity: choiceField(),
    biologicalGender: choiceField(),
    genderIdentity: textField(SHORT_TEXT_MAX_LENGTH, { required: PERSON_MESSAGES.chooseValue, tooLong: PERSON_MESSAGES.shortTextTooLong }, false),
    sexualOrientation: textField(SHORT_TEXT_MAX_LENGTH, { tooLong: PERSON_MESSAGES.sexualOrientationHelp }, true),
    socialSecurityNumber: z
      .string()
      .refine((value) => value === "" || (ssnMask !== "" && value === ssnMask) || isCompleteSsn(value), { message: PERSON_MESSAGES.ssnIncomplete }),
  }) satisfies z.ZodType<PersonalValues, PersonalValues>
}

/** A `myself` text value as the form shows it: `""` when not provided (null, blank, `n/a`). */
function formText(value: string | null | undefined): string {
  return isNotProvided(value) ? "" : (value as string)
}

/** The form values of `myself` (all `""` before it loads); the birth date as `MM/DD/YYYY`; the SSN as its safe mask or `""`. */
export function toPersonalValues(myself: Myself | null | undefined): PersonalValues {
  return {
    namePrefix: formText(myself?.namePrefix),
    firstName: formText(myself?.firstName),
    middleName: formText(myself?.middleName),
    lastName: formText(myself?.lastName),
    nameSuffix: formText(myself?.nameSuffix),
    otherNames: formText(myself?.otherNames),
    titles: formText(myself?.titles),
    birthDate: wireToDisplayDate(myself?.birthDate) ?? "",
    cityOfBirth: formText(myself?.cityOfBirth),
    race: formText(myself?.race),
    ethnicity: formText(myself?.ethnicity),
    biologicalGender: formText(myself?.biologicalGender),
    genderIdentity: formText(myself?.genderIdentity),
    sexualOrientation: formText(myself?.sexualOrientation),
    socialSecurityNumber: toSsnFormValue(myself?.socialSecurityNumber),
  }
}

/** The value a field sends: trimmed text, the birth date as `YYYY-MM-DD` (`""` when unset or unparsable). */
function wireValue(field: PersonalField, value: string): string {
  const text = normalizeName(value)
  return field === "birthDate" ? (displayToWireDate(text) ?? "") : text
}

/**
 * The SSN part of the diff (Story 2.3): a changed complete value as
 * `XXX-XX-XXXX`, a clear of a saved one (`""` over a mask) as exactly
 * `"n/a"` (the platform rejects `""`). The untouched mask, an incomplete
 * value and an unchanged one are never sent.
 */
function ssnChange(value: string, saved: string): string | undefined {
  if (value === saved) return undefined
  if (value === "") return saved === "" ? undefined : CLEARED
  return isCompleteSsn(value) ? value : undefined
}

/**
 * The changed fields only, compared after trimming (Story 2.2): strings, the
 * birth date as `YYYY-MM-DD`, and a cleared optional field as `"n/a"`. Only
 * these 14 fields and the SSN (Story 2.3, `ssnChange`) can appear: never
 * `email`, `phoneNumber` or `phoneNumberRegion` (AD-9), and never Signature.
 */
export function personalDiff(values: PersonalValues, baseline: PersonalValues): PersonalInformationPayload {
  const diff: Partial<Record<PersonalField | typeof SSN_FIELD, string>> = {}
  for (const field of PERSONAL_DRAFT_FIELDS) {
    const next = wireValue(field, values[field])
    if (next === wireValue(field, baseline[field])) continue
    diff[field] = next === "" && PERSONAL_OPTIONAL_FIELDS.has(field) ? CLEARED : next
  }
  const ssn = ssnChange(values.socialSecurityNumber, baseline.socialSecurityNumber)
  if (ssn !== undefined) diff.socialSecurityNumber = ssn
  return diff
}

/** A draft value as text (a draft is stored JSON: anything else reads as empty). */
const draftText = (value: unknown): string => (typeof value === "string" ? value : "")

/** The draft conflict compare rows (F4): each draft field whose stored value differs from the current one. */
export function personalDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  return PERSONAL_DRAFT_FIELDS.filter((field) => draftText(draft[field]) !== draftText(current[field])).map((field) => ({
    field,
    label: PERSONAL_LABELS[field],
    mine: draftText(draft[field]),
    current: draftText(current[field]),
  }))
}
