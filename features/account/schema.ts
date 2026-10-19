import { z } from "zod"
import type { Myself, AccountDetailsPayload } from "@/lib/api"
import { isNotProvided } from "@/lib/shared/display-value"
import { displayToWireDate, wireToDisplayDate } from "@/lib/shared/dates"
import { nameIssue, normalizeName, isBirthDateInRange, birthDateAgeRange } from "@/lib/shared/person-rules"
import { ACCOUNT_MESSAGES, PERSON_MESSAGES, FIELD_MESSAGES, formatMessage } from "@/lib/shared/messages"
import type { DraftValues, DraftDiffRow } from "@/features/shell"

export const ACCOUNT_DRAFT_FIELDS = ["firstName", "lastName", "birthDate", "preferredLanguage", "timeZone", "locale"] as const
export interface AccountFormValues {
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
    firstName: provided(myself?.firstName), lastName: provided(myself?.lastName),
    birthDate: wireToDisplayDate(myself?.birthDate) ?? "",
    preferredLanguage: provided(myself?.preferredLanguage), timeZone: provided(myself?.timeZone),
    locale: provided(myself?.locale) || "en-US",
  }
}

export function accountSchema(roles?: readonly string[], today = new Date()) {
  return z.object({
    firstName: z.string(), lastName: z.string(), birthDate: z.string(),
    preferredLanguage: z.string(), timeZone: z.string(), locale: z.string(),
  }).superRefine((values, ctx) => {
    for (const field of ["firstName", "lastName"] as const) {
      const issue = nameIssue(values[field])
      if (issue) ctx.addIssue({ code: "custom", path: [field], message: issue === "required" ? PERSON_MESSAGES[`${field}Required`] : issue === "tooLong" ? PERSON_MESSAGES[`${field}TooLong`] : PERSON_MESSAGES.notPrintable })
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

export const ACCOUNT_FIELD_LABELS = { firstName: FIELD_MESSAGES.firstName, lastName: FIELD_MESSAGES.lastName, birthDate: FIELD_MESSAGES.birthDate, preferredLanguage: ACCOUNT_MESSAGES.preferredLanguage, timeZone: ACCOUNT_MESSAGES.timeZone, locale: ACCOUNT_MESSAGES.locale }
export function accountDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  return ACCOUNT_DRAFT_FIELDS.filter((field) => draft[field] !== current[field]).map((field) => ({ field, label: ACCOUNT_FIELD_LABELS[field], mine: String(draft[field] ?? ""), current: String(current[field] ?? "") }))
}
