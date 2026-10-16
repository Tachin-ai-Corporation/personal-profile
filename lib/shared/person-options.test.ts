import { describe, expect, it } from "vitest"
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

describe("accepted values (Story 2.2; drift-tested against the proxy enums in allowlist/personal.test.ts)", () => {
  it("holds the PUT v2/user/edit enum values, frozen", () => {
    expect(PERSON_UNKNOWN).toBe("Unknown")
    expect(PERSON_RACE_VALUES).toEqual(PERSON_RACE_FALLBACK)
    expect(PERSON_ETHNICITY_VALUES).toEqual(["Unknown", "Hispanic or Latino", "Not Hispanic or Latino"])
    expect(PERSON_BIOLOGICAL_GENDER_VALUES).toEqual(["Male", "Female", "Other", "Unknown", "Asked but not answered"])
    for (const list of [PERSON_RACE_VALUES, PERSON_ETHNICITY_VALUES, PERSON_BIOLOGICAL_GENDER_VALUES]) expect(Object.isFrozen(list)).toBe(true)
  })

  it("the fallbacks offer only accepted values", () => {
    for (const value of PERSON_RACE_FALLBACK) expect(PERSON_RACE_VALUES).toContain(value)
    for (const value of PERSON_ETHNICITY_FALLBACK) expect(PERSON_ETHNICITY_VALUES).toContain(value)
  })
})

describe("offeredOptions", () => {
  const accepted = ["A", "B", "C", "Unknown"]

  it("keeps the list's accepted values in the list's order", () => {
    expect(offeredOptions(["C", "X", "A", "Unknown"], accepted, ["B"], "Unknown")).toEqual(["C", "A", "Unknown"])
  })

  it("appends the preselect when the list lacks it", () => {
    expect(offeredOptions(["B", "A"], accepted, [], "Unknown")).toEqual(["B", "A", "Unknown"])
  })

  it("an empty intersection uses the fallback's accepted values (plus the preselect)", () => {
    expect(offeredOptions(["X", "Y"], accepted, ["B", "Z", "A"], "Unknown")).toEqual(["B", "A", "Unknown"])
    expect(offeredOptions([], accepted, ["Unknown", "C"], "Unknown")).toEqual(["Unknown", "C"])
  })

  it("offers only the preselect when nothing else is accepted", () => {
    expect(offeredOptions(["X"], accepted, ["Z"], "Unknown")).toEqual(["Unknown"])
  })

  it("biological gender: a platform-only current value is never offered", () => {
    expect(offeredOptions([], PERSON_BIOLOGICAL_GENDER_VALUES, biologicalGenderFallback("Intersex"), PERSON_ASKED_NOT_ANSWERED)).toEqual([
      PERSON_ASKED_NOT_ANSWERED,
    ])
  })
})
