/**
 * Person option lists (Team A, Story 2.1; the planned FOUNDATION §3.3 module):
 * the fallbacks Personal information offers when `GET v2/type/key/Person`
 * fails or sends an empty list, and the fixed gender identity list. The
 * platform lists themselves come from `valueListOptions` (`lib/api/type-keys.ts`);
 * `features/personal/use-person-options.ts` picks between the two. Story 2.2
 * adds the values `PUT v2/user/edit` accepts and `offeredOptions`, which
 * intersects the two sources so a picker never offers a value the write
 * rejects. Values are platform data (the `PersonConstants` literals), not
 * catalog copy.
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

/** The "unknown" value of race and ethnicity (Story 2.2 preselect). */
export const PERSON_UNKNOWN = "Unknown"

/**
 * The race values `PUT v2/user/edit` accepts: a copy of the proxy's `RACES`
 * (`PersonConstants.Race`; `lib/shared` never imports `lib/server`). A drift
 * test in `lib/server/proxy/allowlist/personal.test.ts` keeps them equal.
 */
export const PERSON_RACE_VALUES: readonly string[] = Object.freeze([
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Middle Eastern or North African",
  "Native Hawaiian or other Pacific Islander",
  "White",
  "Other Race",
  PERSON_UNKNOWN,
])

/** The ethnicity values `PUT v2/user/edit` accepts (a copy of the proxy's `ETHNICITIES`; drift-tested). */
export const PERSON_ETHNICITY_VALUES: readonly string[] = Object.freeze([PERSON_UNKNOWN, "Hispanic or Latino", "Not Hispanic or Latino"])

/** The biological gender values `PUT v2/user/edit` accepts (a copy of the proxy's `BIOLOGICAL_GENDERS`; drift-tested). */
export const PERSON_BIOLOGICAL_GENDER_VALUES: readonly string[] = Object.freeze(["Male", "Female", "Other", PERSON_UNKNOWN, PERSON_ASKED_NOT_ANSWERED])

/**
 * What a Personal information picker offers (Story 2.2): the values of `list`
 * that `accepted` holds (in `list` order), so no offered value can be a
 * `PUT v2/user/edit` 400. When none is left, the accepted values of
 * `fallback` instead. `preselect` (the value an unset field gets) is always
 * offered, appended when missing.
 */
export function offeredOptions(list: readonly string[], accepted: readonly string[], fallback: readonly string[], preselect: string): string[] {
  const allowed = new Set(accepted)
  const fromList = list.filter((value) => allowed.has(value))
  const offered = fromList.length > 0 ? fromList : fallback.filter((value) => allowed.has(value))
  return offered.includes(preselect) ? offered : [...offered, preselect]
}
