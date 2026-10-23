import { primarySelection, samePrimary, type PrimaryContactLists } from "./primary-contacts"
import { z } from "zod"
import { ACCOUNT_LOCALE, type Myself, type AccountDetailsPayload } from "@/lib/api"
import { canonicalAccountLocale } from "./view-model"
import { isNotProvided } from "@/lib/shared/display-value"
import { displayToWireDate, wireToDisplayDate } from "@/lib/shared/dates"
import { nameIssue, normalizeName, isBirthDateInRange, birthDateAgeRange } from "@/lib/shared/person-rules"
import { ACCOUNT_MESSAGES, PERSON_MESSAGES, FIELD_MESSAGES, formatMessage } from "@/lib/shared/messages"
import type { DraftValues, DraftDiffRow } from "@/features/shell"

export const ACCOUNT_DRAFT_FIELDS = ["firstName", "lastName", "birthDate", "preferredLanguage", "timeZone", "locale", "primaryEmail", "primaryPhone"] as const
export interface AccountFormValues {
  primaryEmail: string
  primaryPhone: string
  firstName: string
  lastName: string
  birthDate: string
  preferredLanguage: string
  timeZone: string
  locale: string
}

export function accountFormDefaults(myself?: Myself): AccountFormValues {
  const provided = (value: string | null | undefined): string => isNotProvided(value) ? "" : normalizeName(value)
  return {
    primaryEmail: provided(myself?.email), primaryPhone: provided(myself?.phoneNumber),
    firstName: provided(myself?.firstName), lastName: provided(myself?.lastName),
    birthDate: wireToDisplayDate(myself?.birthDate) ?? "",
    preferredLanguage: provided(myself?.preferredLanguage), timeZone: provided(myself?.timeZone),
    // A legacy `en-us` is the listed `en-US`, so its Select shows the option and a save sends no locale write.
    locale: canonicalAccountLocale(provided(myself?.locale)) || ACCOUNT_LOCALE,
  }
}

export function accountSchema(roles?: readonly string[], today = new Date(), primaries?: { readonly baseline: AccountFormValues; readonly contacts: PrimaryContactLists }) {
  return z.object({
    primaryEmail: z.string(), primaryPhone: z.string(),
    firstName: z.string(), lastName: z.string(), birthDate: z.string(),
    preferredLanguage: z.string(), timeZone: z.string(), locale: z.string(),
  }).superRefine((values, ctx) => {
    for (const field of ["firstName", "lastName"] as const) {
      const issue = isNotProvided(values[field]) ? "required" : nameIssue(values[field])
      if (issue) ctx.addIssue({ code: "custom", path: [field], message: issue === "required" ? PERSON_MESSAGES[`${field}Required`] : issue === "tooLong" ? PERSON_MESSAGES[`${field}TooLong`] : PERSON_MESSAGES.notPrintable })
    }
    if (!z.email().safeParse(values.primaryEmail).success) ctx.addIssue({ code: "custom", path: ["primaryEmail"], message: ACCOUNT_MESSAGES.emailInvalid })
    if (!values.primaryPhone.trim()) ctx.addIssue({ code: "custom", path: ["primaryPhone"], message: ACCOUNT_MESSAGES.phoneRequired })
    if (primaries) {
      for (const [field, kind, rows] of [["primaryEmail", "Email", primaries.contacts.email], ["primaryPhone", "Mobile", primaries.contacts.mobile]] as const) {
        if (!samePrimary(kind, values[field], primaries.baseline[field]) && !primarySelection(kind, values[field], primaries.baseline[field], rows)) ctx.addIssue({ code: "custom", path: [field], message: ACCOUNT_MESSAGES.primaryUnavailable })
      }
    }
    const wire = displayToWireDate(values.birthDate)
    const age = birthDateAgeRange(roles)
    const dateError = !values.birthDate.trim() ? PERSON_MESSAGES.birthDateRequired : !wire ? PERSON_MESSAGES.birthDateFormat : !isBirthDateInRange(wire, roles, today) ? formatMessage(PERSON_MESSAGES.ageRange, { min: age.min, max: age.max }) : null
    if (dateError) ctx.addIssue({ code: "custom", path: ["birthDate"], message: dateError })
    for (const [field, message] of [["preferredLanguage", ACCOUNT_MESSAGES.languageRequired], ["timeZone", ACCOUNT_MESSAGES.timeZoneRequired], ["locale", ACCOUNT_MESSAGES.localeRequired]] as const) {
      if (!values[field].trim()) ctx.addIssue({ code: "custom", path: [field], message })
    }
  })
}

export function accountDetailsDiff(values: AccountFormValues, baseline: AccountFormValues): AccountDetailsPayload {
  const diff: Record<string, string> = {}
  for (const field of ["firstName", "lastName", "birthDate", "preferredLanguage"] as const) {
    const normalize = (value: string) => field === "birthDate" ? displayToWireDate(value) ?? value : normalizeName(value)
    if (normalize(values[field]) !== normalize(baseline[field])) diff[field] = normalize(values[field])
  }
  return diff
}

export const ACCOUNT_FIELD_LABELS = { primaryEmail: ACCOUNT_MESSAGES.primaryEmail, primaryPhone: ACCOUNT_MESSAGES.primaryPhone, firstName: FIELD_MESSAGES.firstName, lastName: FIELD_MESSAGES.lastName, birthDate: FIELD_MESSAGES.birthDate, preferredLanguage: ACCOUNT_MESSAGES.preferredLanguage, timeZone: ACCOUNT_MESSAGES.timeZone, locale: ACCOUNT_MESSAGES.locale }
export function accountDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  return ACCOUNT_DRAFT_FIELDS.filter((field) => draft[field] !== current[field]).map((field) => ({ field, label: ACCOUNT_FIELD_LABELS[field], mine: String(draft[field] ?? ""), current: String(current[field] ?? "") }))
}
