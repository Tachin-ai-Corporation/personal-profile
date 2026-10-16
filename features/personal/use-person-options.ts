"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { keys, PERSON_TYPE_KEY, valueListOptions, type ApiResponseError, type PERSON_VALUE_LISTS, type TypeInfo } from "@/lib/api"
import {
  biologicalGenderFallback,
  offeredOptions,
  PERSON_ASKED_NOT_ANSWERED,
  PERSON_BIOLOGICAL_GENDER_VALUES,
  PERSON_ETHNICITY_FALLBACK,
  PERSON_ETHNICITY_VALUES,
  PERSON_GENDER_IDENTITY_OPTIONS,
  PERSON_RACE_FALLBACK,
  PERSON_RACE_VALUES,
  PERSON_UNKNOWN,
} from "@/lib/shared/person-options"

/** The Personal information option lists (Story 2.1 loads them; Story 2.2's pickers offer them). */
export interface PersonOptions {
  readonly race: readonly string[]
  readonly ethnicity: readonly string[]
  readonly biologicalGender: readonly string[]
  /** Fixed; the Combobox also takes free text. */
  readonly genderIdentity: readonly string[]
  /** The type key is still loading (the lists hold the fallbacks meanwhile). */
  readonly isLoading: boolean
  /**
   * What the Story 2.2 pickers offer: each list above ∩ the values
   * `PUT v2/user/edit` accepts, so no offered value can be a 400 (empty → the
   * fallback's accepted values), always including the preselect ("Unknown",
   * "Unknown", "Asked but not answered"). A saved value missing here is shown
   * as the Select's `unlistedValue`.
   */
  readonly offered: {
    readonly race: readonly string[]
    readonly ethnicity: readonly string[]
    readonly biologicalGender: readonly string[]
  }
}

/** The value an unset picker gets when edit opens (Story 2.2). */
export const PERSON_PRESELECTS = {
  race: PERSON_UNKNOWN,
  ethnicity: PERSON_UNKNOWN,
  biologicalGender: PERSON_ASKED_NOT_ANSWERED,
  genderIdentity: PERSON_ASKED_NOT_ANSWERED,
} as const

/** A Person VALUE_LIST attribute key (`PERSON_VALUE_LISTS`, `lib/api/personal.ts`), so the keys can't drift. */
type PersonValueList = (typeof PERSON_VALUE_LISTS)[number]

/** The names of one Person VALUE_LIST (`n/a` dropped, locale-sorted), or `fallback` when it is empty. */
function listOr(info: TypeInfo | undefined, attrKey: PersonValueList, fallback: readonly string[]): readonly string[] {
  const names = valueListOptions(info, attrKey).map((value) => value.name)
  return names.length > 0 ? names : fallback
}

/**
 * Race, Ethnicity and Biological gender from `GET v2/type/key/Person`
 * (`keys.typeKey(PERSON_TYPE_KEY)`, the shared type-key loader). While it
 * loads, when it fails or when a list is empty, the list falls back to
 * `lib/shared/person-options.ts`: addendum §C for race and ethnicity,
 * "Asked but not answered" plus `currentBiologicalGender` for biological
 * gender. A failure is never surfaced: it never blocks or errors the read
 * view. The result keeps its references while the inputs are the same.
 * `offered` intersects them with the `user/edit` enums (Story 2.2; settles
 * the deferred-work two-sources entry: the UI intersects, the schema stays).
 */
export function usePersonOptions(currentBiologicalGender: string | null | undefined): PersonOptions {
  const { data, error, isLoading } = useSWR<TypeInfo | undefined, ApiResponseError>(keys.typeKey(PERSON_TYPE_KEY))
  const failed = error !== undefined
  return useMemo(() => {
    // On an error the fallbacks apply, even over stale data.
    const info = failed ? undefined : data
    const genderFallback = biologicalGenderFallback(currentBiologicalGender)
    const race = listOr(info, "race", PERSON_RACE_FALLBACK)
    const ethnicity = listOr(info, "ethnicity", PERSON_ETHNICITY_FALLBACK)
    const biologicalGender = listOr(info, "biologicalGender", genderFallback)
    return {
      race,
      ethnicity,
      biologicalGender,
      genderIdentity: PERSON_GENDER_IDENTITY_OPTIONS,
      isLoading,
      offered: {
        race: offeredOptions(race, PERSON_RACE_VALUES, PERSON_RACE_FALLBACK, PERSON_PRESELECTS.race),
        ethnicity: offeredOptions(ethnicity, PERSON_ETHNICITY_VALUES, PERSON_ETHNICITY_FALLBACK, PERSON_PRESELECTS.ethnicity),
        biologicalGender: offeredOptions(biologicalGender, PERSON_BIOLOGICAL_GENDER_VALUES, genderFallback, PERSON_PRESELECTS.biologicalGender),
      },
    }
  }, [data, failed, isLoading, currentBiologicalGender])
}
