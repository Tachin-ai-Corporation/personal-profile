/**
 * The person rules shared by Personal information (Epic 2), Account settings
 * (Epic 7) and the proxy's `PUT v2/user/edit` schema (AD-11, PA4, PRC15), so
 * a value the form accepts is never a proxy 400. No schema redefines them;
 * their copy is `PERSON_MESSAGES` (`lib/shared/messages/person.ts`).
 */

import { compareDates, formatWireDate, localCalendarDate, minusYears, parseWireDate } from "./dates"

/** The backend `PATIENT_FIRST_NAME_MAX_LEN` / `PATIENT_LAST_NAME_MAX_LEN` (also middle, other names, titles). */
export const NAME_MAX_LENGTH = 24
export const NAME_MIN_LENGTH = 1
/** The backend `PREFIX_SUFFIX_NAME_MAX_LEN`. */
export const PREFIX_SUFFIX_MAX_LENGTH = 10
/** The backend `SHORT_STRING_NAME_MAX_LEN` (city of birth, sexual orientation, gender identity). */
export const SHORT_TEXT_MAX_LENGTH = 128

/** The role with the stricter age rule. */
export const PROCTOR_ROLE = "Proctor"

/**
 * Not accepted in a person text field: control, format (zero-width, bidi
 * overrides), surrogate, private-use and unassigned code points, and emoji
 * (Story 2.2 AC: pictographs, skin-tone modifiers, flag letters, the emoji
 * variation selector and the keycap mark). Combining accents stay allowed.
 */
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{20E3}]/u

export type NameIssue = "required" | "tooLong" | "notPrintable"

/** The value the rules check and the form sends: trimmed (the backend's `validateAndClean`). */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim()
}

/**
 * Checks a person text field after `normalizeName`: 1–`max` characters
 * (code points), printable only. `null` when valid.
 */
export function textIssue(value: string | null | undefined, max: number): NameIssue | null {
  const normalized = normalizeName(value)
  if (normalized.length < NAME_MIN_LENGTH) return "required"
  if (NON_PRINTABLE.test(normalized)) return "notPrintable"
  return Array.from(normalized).length > max ? "tooLong" : null
}

/** A first or last name: 1–24 characters after trimming, printable only. */
export function nameIssue(value: string | null | undefined): NameIssue | null {
  return textIssue(value, NAME_MAX_LENGTH)
}

/** `roles` includes exactly `"Proctor"` (case-sensitive). */
export function hasProctorRole(roles: readonly string[] | null | undefined): boolean {
  return roles?.includes(PROCTOR_ROLE) ?? false
}

export interface AgeRange {
  readonly min: number
  readonly max: number
}

/** 18–120, or 21–120 for a Proctor. */
export function birthDateAgeRange(roles: readonly string[] | null | undefined): AgeRange {
  return { min: hasProctorRole(roles) ? 21 : 18, max: 120 }
}

/**
 * Whether a `YYYY-MM-DD` birth date is inside the age range for `roles` at
 * `today`'s local date, exactly as the backend checks it
 * (`OneHealthUtil.validateDate`): `today − max years ≤ birth ≤ today − min
 * years`, with Java `minusYears` (Feb 29 → Feb 28). So a Feb 29 birthday
 * reaches a new age on Mar 1 in non-leap years, exactly 120 years passes and
 * 120 years and a day does not. Invalid or future dates → false.
 */
export function isBirthDateInRange(date: string | null | undefined, roles: readonly string[] | null | undefined, today: Date): boolean {
  const birth = parseWireDate(date)
  if (!birth) return false
  const on = localCalendarDate(today)
  const { min, max } = birthDateAgeRange(roles)
  return compareDates(birth, minusYears(on, min)) <= 0 && compareDates(birth, minusYears(on, max)) >= 0
}

/** Inclusive `YYYY-MM-DD` birth-date bounds (a `DateBounds` with both ends). */
export interface BirthDateBounds {
  readonly min: string
  readonly max: string
}

/**
 * The bounds `isBirthDateInRange` accepts for `roles` at `today`'s local date:
 * `min` = today − 120 years, `max` = today − 18 (Proctor: 21) years, both
 * inclusive, with Java `minusYears` (Feb 29 → Feb 28). For the date input's
 * calendar (F5-1); the age message stays with the caller's schema.
 */
export function birthDateBounds(roles: readonly string[] | null | undefined, today: Date): BirthDateBounds {
  const on = localCalendarDate(today)
  const { min, max } = birthDateAgeRange(roles)
  return { min: formatWireDate(minusYears(on, max)), max: formatWireDate(minusYears(on, min)) }
}
