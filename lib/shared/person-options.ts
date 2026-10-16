/**
 * Person option lists (Team A, Story 2.1; the planned FOUNDATION §3.3 module):
 * the fallbacks Personal information offers when `GET v2/type/key/Person`
 * fails or sends an empty list, and the fixed gender identity list. The
 * platform lists themselves come from `valueListOptions` (`lib/api/type-keys.ts`);
 * `features/personal/use-person-options.ts` picks between the two. Values are
 * platform data (the `PersonConstants` literals), not catalog copy.
 */

import { isNotProvided } from "./display-value"

/** The "no answer" value of biological gender and gender identity. */
export const PERSON_ASKED_NOT_ANSWERED = "Asked but not answered"

/** Race when the type key fails (Profile addendum §C, in its order). */
export const PERSON_RACE_FALLBACK: readonly string[] = Object.freeze([
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native Hawaiian or other Pacific Islander",
  "White",
  "Other Race",
  "Unknown",
])

/** Ethnicity when the type key fails (Profile addendum §C, in its order). */
export const PERSON_ETHNICITY_FALLBACK: readonly string[] = Object.freeze(["Not Hispanic or Latino", "Hispanic or Latino", "Unknown"])

/** The fixed gender identity list (the Combobox also accepts free text, Story 2.2). */
export const PERSON_GENDER_IDENTITY_OPTIONS: readonly string[] = Object.freeze([PERSON_ASKED_NOT_ANSWERED, "Female", "Male", "Other"])

/**
 * Biological gender when the type key fails: "Asked but not answered" plus
 * the user's current value (trimmed), when it is provided and not already
 * that answer, so the saved value stays selectable.
 */
export function biologicalGenderFallback(current: string | null | undefined): string[] {
  const value = isNotProvided(current) ? null : (current as string).trim()
  return value === null || value === PERSON_ASKED_NOT_ANSWERED ? [PERSON_ASKED_NOT_ANSWERED] : [PERSON_ASKED_NOT_ANSWERED, value]
}
