import { describe, expect, it } from "vitest"
import {
  biologicalGenderFallback,
  PERSON_ASKED_NOT_ANSWERED,
  PERSON_ETHNICITY_FALLBACK,
  PERSON_GENDER_IDENTITY_OPTIONS,
  PERSON_RACE_FALLBACK,
} from "./person-options"

describe("person option fallbacks (Story 2.1, addendum §C)", () => {
  it("holds the addendum §C race list, in order", () => {
    expect(PERSON_RACE_FALLBACK).toEqual([
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
  })

  it("holds the addendum §C ethnicity list, in order", () => {
    expect(PERSON_ETHNICITY_FALLBACK).toEqual(["Not Hispanic or Latino", "Hispanic or Latino", "Unknown"])
  })

  it("holds the fixed gender identity list", () => {
    expect(PERSON_GENDER_IDENTITY_OPTIONS).toEqual(["Asked but not answered", "Female", "Male", "Other"])
  })

  it("freezes the lists", () => {
    for (const list of [PERSON_RACE_FALLBACK, PERSON_ETHNICITY_FALLBACK, PERSON_GENDER_IDENTITY_OPTIONS]) expect(Object.isFrozen(list)).toBe(true)
  })
})

describe("biologicalGenderFallback", () => {
  it.each([
    ["Female", ["Asked but not answered", "Female"]],
    ["  Male ", ["Asked but not answered", "Male"]],
    [PERSON_ASKED_NOT_ANSWERED, ["Asked but not answered"]],
    [null, ["Asked but not answered"]],
    [undefined, ["Asked but not answered"]],
    ["", ["Asked but not answered"]],
    ["n/a", ["Asked but not answered"]],
    ["N/A", ["Asked but not answered"]],
  ])("%j → %j", (current, expected) => {
    expect(biologicalGenderFallback(current)).toEqual(expected)
  })

  it("returns a fresh list each time", () => {
    const first = biologicalGenderFallback("Female")
    first.push("x")
    expect(biologicalGenderFallback("Female")).toEqual(["Asked but not answered", "Female"])
  })
})
