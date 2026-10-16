import { describe, expect, it } from "vitest"
import { toMyself } from "@/lib/api"
import { myselfWire } from "@/test/myself-fixture"
import {
  ageRangeMessage,
  PERSONAL_DRAFT_FIELDS,
  PERSONAL_FIELD_ORDER,
  PERSONAL_LABELS,
  personalDiff,
  personalDraftDiff,
  personalSchema,
  toPersonalValues,
  type PersonalValues,
} from "./schema"

/** Story 2.2 (NG-9022): the Personal information rules, diff and draft wiring. */

/** A local "today" (October 16, 2026). */
const TODAY = new Date(2026, 9, 16)

const VALID: PersonalValues = {
  namePrefix: "Dr.",
  firstName: "Ann",
  middleName: "Marie",
  lastName: "Lee",
  nameSuffix: "Jr.",
  otherNames: "Ann Smith",
  titles: "MD",
  birthDate: "04/15/1990",
  cityOfBirth: "Springfield",
  race: "Asian",
  ethnicity: "Not Hispanic or Latino",
  biologicalGender: "Female",
  genderIdentity: "Woman",
  sexualOrientation: "Straight",
  socialSecurityNumber: "***-**-1234",
}

/** The saved mask of `VALID` (the schema's untouched baseline). */
const MASK = "***-**-1234"

/** The message per field for `values` (merged into `VALID`), or `{}` when valid. */
function errors(values: Partial<PersonalValues>, roles: readonly string[] | null = ["Patient"]): Partial<Record<keyof PersonalValues, string>> {
  const result = personalSchema(roles, TODAY, MASK).safeParse({ ...VALID, ...values })
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
}

const chars = (count: number, char = "a") => char.repeat(count)

describe("personalSchema: names", () => {
  it("accepts the full valid set, and trimmed values at the limits", () => {
    expect(errors({})).toEqual({})
    expect(errors({ firstName: ` ${chars(24)} `, middleName: chars(24), otherNames: chars(24), titles: chars(24), namePrefix: chars(10), nameSuffix: chars(10) })).toEqual({})
  })

  it("First and Last name are required (after trimming) and up to 24 characters", () => {
    expect(errors({ firstName: "   ", lastName: "" })).toEqual({ firstName: "First name is required", lastName: "Last name is required" })
    expect(errors({ firstName: chars(25), lastName: chars(25) })).toEqual({
      firstName: "First name can be up to 24 characters",
      lastName: "Last name can be up to 24 characters",
    })
  })

  it("Middle name, Other names and Titles are optional, up to 24 characters", () => {
    expect(errors({ middleName: "", otherNames: "  ", titles: "" })).toEqual({})
    expect(errors({ middleName: chars(25), otherNames: chars(25), titles: chars(25) })).toEqual({
      middleName: "Up to 24 characters",
      otherNames: "Up to 24 characters",
      titles: "Up to 24 characters",
    })
  })

  it("Name prefix and suffix are optional, up to 10 characters", () => {
    expect(errors({ namePrefix: "", nameSuffix: "" })).toEqual({})
    expect(errors({ namePrefix: chars(11), nameSuffix: chars(11) })).toEqual({ namePrefix: "Up to 10 characters", nameSuffix: "Up to 10 characters" })
  })

  it("accepts accented letters, apostrophes, hyphens, periods and spaces; rejects control characters and emoji", () => {
    expect(errors({ firstName: "Zoë-Anne", lastName: "O'Brien", middleName: "J. R." })).toEqual({})
    const message = "Use letters, spaces and standard punctuation only"
    expect(errors({ firstName: "An\u0007n", middleName: "\u200b", namePrefix: "Dr\u0000" })).toEqual({ firstName: message, middleName: message, namePrefix: message })
    // A lone surrogate and a private-use code point are not printable.
    expect(errors({ lastName: "Lee\ud83d", titles: "\ue000" })).toEqual({ lastName: message, titles: message })
    // Emoji (the shared rule, foundation be9aee2): a pictograph, a skin tone, a flag; on every person text field.
    expect(errors({ firstName: "Ann\u{1F600}", otherNames: "\u{1F44D}\u{1F3FD}", genderIdentity: "\u{1F1FA}\u{1F1F8}", sexualOrientation: "\u2764\u{FE0F}" })).toEqual({
      firstName: message,
      otherNames: message,
      genderIdentity: message,
      sexualOrientation: message,
    })
  })
})

describe("personalSchema: other text", () => {
  it("City of birth and Sexual orientation are optional, up to 128", () => {
    expect(errors({ cityOfBirth: "", sexualOrientation: "" })).toEqual({})
    expect(errors({ cityOfBirth: chars(128), sexualOrientation: chars(128) })).toEqual({})
    expect(errors({ cityOfBirth: chars(129), sexualOrientation: chars(129) })).toEqual({
      cityOfBirth: "Up to 128 characters",
      sexualOrientation: "Up to 128 characters.",
    })
  })

  it("a non-printable City of birth or Sexual orientation reads the printable copy, not the length copy", () => {
    const message = "Use letters, spaces and standard punctuation only"
    expect(errors({ cityOfBirth: "Spring\u0001field", sexualOrientation: "\u202e" })).toEqual({ cityOfBirth: message, sexualOrientation: message })
  })

  it("Gender identity is required, up to 128, printable", () => {
    expect(errors({ genderIdentity: " " })).toEqual({ genderIdentity: "Choose a value" })
    expect(errors({ genderIdentity: chars(128) })).toEqual({})
    expect(errors({ genderIdentity: chars(129) })).toEqual({ genderIdentity: "Up to 128 characters" })
    expect(errors({ genderIdentity: "\u0002" })).toEqual({ genderIdentity: "Use letters, spaces and standard punctuation only" })
  })

  it("a required name or Gender identity can't be a clear sentinel (n/a, N/A, -1)", () => {
    for (const sentinel of ["n/a", "N/A", " -1 "]) {
      expect(errors({ firstName: sentinel, lastName: sentinel, genderIdentity: sentinel }), sentinel).toEqual({
        firstName: "First name is required",
        lastName: "Last name is required",
        genderIdentity: "Choose a value",
      })
    }
    // Optional fields keep treating them as text (a cleared field is sent as n/a by the diff).
    expect(errors({ middleName: "n/a", cityOfBirth: "-1" })).toEqual({})
  })

  it("Race, Ethnicity and Biological gender are required", () => {
    expect(errors({ race: "", ethnicity: " ", biologicalGender: "" })).toEqual({
      race: "Choose a value",
      ethnicity: "Choose a value",
      biologicalGender: "Choose a value",
    })
  })
})

describe("personalSchema: birth date", () => {
  it("empty is required; unparsable or partial is a format error", () => {
    expect(errors({ birthDate: "" })).toEqual({ birthDate: "Birth date is required" })
    for (const birthDate of ["04/15", "13/01/1990", "02/30/1990", "1990-04-15"]) expect(errors({ birthDate })).toEqual({ birthDate: "Enter a date as MM/DD/YYYY" })
  })

  it("18th birthday today is valid, one day short is not; exactly 120 years is valid, 120 years and a day is not (backend minusYears)", () => {
    const range = "You must be between 18 and 120 years old"
    expect(errors({ birthDate: "10/16/2008" })).toEqual({})
    expect(errors({ birthDate: "10/17/2008" })).toEqual({ birthDate: range })
    expect(errors({ birthDate: "10/16/1906" })).toEqual({})
    expect(errors({ birthDate: "10/15/1906" })).toEqual({ birthDate: range })
  })

  it("a future date is outside the range", () => {
    expect(errors({ birthDate: "01/01/2030" })).toEqual({ birthDate: "You must be between 18 and 120 years old" })
  })

  it("Proctor: the boundary is 21 (null roles count as no Proctor)", () => {
    const range = "You must be between 21 and 120 years old"
    expect(errors({ birthDate: "10/16/2005" }, ["Patient", "Proctor"])).toEqual({})
    expect(errors({ birthDate: "10/17/2005" }, ["Proctor"])).toEqual({ birthDate: range })
    expect(errors({ birthDate: "10/17/2005" }, null)).toEqual({})
  })

  it("ageRangeMessage is the help copy for the roles", () => {
    expect(ageRangeMessage(["Patient"])).toBe("You must be between 18 and 120 years old")
    expect(ageRangeMessage(["Proctor"])).toBe("You must be between 21 and 120 years old")
    expect(ageRangeMessage(undefined)).toBe("You must be between 18 and 120 years old")
  })

  it("takes today and the saved SSN mask explicitly (no default turns a saved mask invalid)", () => {
    expect(personalSchema(null, new Date(), MASK).safeParse(VALID).success).toBe(true)
    expect(personalSchema(null, new Date(), "").safeParse(VALID).success).toBe(false)
  })
})

describe("toPersonalValues", () => {
  it("maps myself to the 15 form fields, the birth date as MM/DD/YYYY, the SSN as its mask", () => {
    expect(toPersonalValues(toMyself(myselfWire()))).toEqual({ ...VALID, birthDate: "04/15/1990" })
  })

  it("not provided (null, blank, n/a) is empty; before myself loads every field is empty", () => {
    const values = toPersonalValues(toMyself(myselfWire({ middleName: "n/a", titles: "  ", race: null, birthDate: "n/a" })))
    expect(values).toMatchObject({ middleName: "", titles: "", race: "", birthDate: "" })
    expect(toPersonalValues(undefined)).toEqual(Object.fromEntries(PERSONAL_FIELD_ORDER.map((field) => [field, ""])))
  })

  it("keeps text as sent (the diff trims)", () => {
    expect(toPersonalValues(toMyself(myselfWire({ firstName: "Ann " }))).firstName).toBe("Ann ")
  })
})

describe("personalDiff", () => {
  it("sends only changed fields, trimmed; whitespace-only changes send nothing", () => {
    expect(personalDiff({ ...VALID, firstName: "Ann " }, VALID)).toEqual({})
    expect(personalDiff({ ...VALID, firstName: " Anna " }, { ...VALID, firstName: "Ann " })).toEqual({ firstName: "Anna" })
  })

  it("a cleared optional field is sent as n/a", () => {
    expect(personalDiff({ ...VALID, middleName: "", cityOfBirth: "  ", sexualOrientation: "" }, VALID)).toEqual({
      middleName: "n/a",
      cityOfBirth: "n/a",
      sexualOrientation: "n/a",
    })
  })

  it("the birth date goes out as YYYY-MM-DD", () => {
    expect(personalDiff({ ...VALID, birthDate: "03/09/1987" }, VALID)).toEqual({ birthDate: "1987-03-09" })
  })

  it("preselects (set over empty values) are changes", () => {
    const unset = { ...VALID, race: "", ethnicity: "", biologicalGender: "", genderIdentity: "" }
    expect(personalDiff({ ...unset, race: "Unknown", ethnicity: "Unknown", biologicalGender: "Asked but not answered", genderIdentity: "Asked but not answered" }, unset)).toEqual({
      race: "Unknown",
      ethnicity: "Unknown",
      biologicalGender: "Asked but not answered",
      genderIdentity: "Asked but not answered",
    })
  })

  it("an unchanged saved value is never sent (even one the picker doesn't offer)", () => {
    const saved = { ...VALID, biologicalGender: "Intersex" }
    expect(personalDiff({ ...saved, firstName: "Anna" }, saved)).toEqual({ firstName: "Anna" })
  })

  it("a full diff holds exactly the 14 fields: never email, phoneNumber, phoneNumberRegion, Signature, or an SSN mask (AD-9)", () => {
    const empty = toPersonalValues(undefined)
    const diff = personalDiff(VALID, empty)
    expect(Object.keys(diff).toSorted()).toEqual([...PERSONAL_DRAFT_FIELDS].toSorted())
    for (const field of ["email", "phoneNumber", "phoneNumberRegion", "socialSecurityNumber", "signature"]) expect(diff).not.toHaveProperty(field)
  })
})

describe("SSN (Story 2.3)", () => {
  it("toPersonalValues holds only a safe mask, else \"\" (n/a, null, a full SSN by mistake)", () => {
    expect(toPersonalValues(toMyself(myselfWire())).socialSecurityNumber).toBe("***-**-1234")
    for (const socialSecurityNumber of ["n/a", null, "", "123-45-6789", "123456789"]) {
      expect(toPersonalValues(toMyself(myselfWire({ socialSecurityNumber }))).socialSecurityNumber, String(socialSecurityNumber)).toBe("")
    }
  })

  it("valid: the untouched saved mask, a complete XXX-XX-XXXX, or empty", () => {
    expect(errors({ socialSecurityNumber: MASK })).toEqual({})
    expect(errors({ socialSecurityNumber: "123-45-6789" })).toEqual({})
    expect(errors({ socialSecurityNumber: "" })).toEqual({})
  })

  it.each(["123-45", "123-45-678", "1", "123456789", "***-**-9999", "***-**-1234 ", "abc"])("%j reads \"Enter all 9 digits of your SSN\"", (socialSecurityNumber) => {
    expect(errors({ socialSecurityNumber })).toEqual({ socialSecurityNumber: "Enter all 9 digits of your SSN" })
  })

  it("without a saved SSN no mask is valid", () => {
    const result = personalSchema(null, TODAY, "").safeParse({ ...VALID, socialSecurityNumber: MASK })
    expect(result.success).toBe(false)
    expect(personalSchema(null, TODAY, "").safeParse({ ...VALID, socialSecurityNumber: "" }).success).toBe(true)
  })

  it("a new complete SSN is sent as XXX-XX-XXXX", () => {
    expect(personalDiff({ ...VALID, socialSecurityNumber: "123-45-6789" }, VALID)).toEqual({ socialSecurityNumber: "123-45-6789" })
    expect(personalDiff({ ...VALID, socialSecurityNumber: "123-45-6789" }, { ...VALID, socialSecurityNumber: "" })).toEqual({
      socialSecurityNumber: "123-45-6789",
    })
  })

  it("clearing a saved SSN sends exactly \"n/a\", never \"\"", () => {
    expect(personalDiff({ ...VALID, socialSecurityNumber: "" }, VALID)).toEqual({ socialSecurityNumber: "n/a" })
  })

  it("the untouched mask, an unchanged value, an empty field without a saved SSN and an incomplete value are never sent", () => {
    expect(personalDiff(VALID, VALID)).toEqual({})
    expect(personalDiff({ ...VALID, socialSecurityNumber: "" }, { ...VALID, socialSecurityNumber: "" })).toEqual({})
    expect(personalDiff({ ...VALID, socialSecurityNumber: "123-45-6789" }, { ...VALID, socialSecurityNumber: "123-45-6789" })).toEqual({})
    expect(personalDiff({ ...VALID, socialSecurityNumber: "123-45" }, VALID)).toEqual({})
    expect(personalDiff({ ...VALID, socialSecurityNumber: "***-**-9999" }, VALID)).toEqual({})
  })

  it("the field order puts the SSN last, after the 14 draft fields", () => {
    expect(PERSONAL_FIELD_ORDER).toEqual([...PERSONAL_DRAFT_FIELDS, "socialSecurityNumber"])
  })
})

describe("drafts", () => {
  it("PERSONAL_DRAFT_FIELDS is exactly the 14 demographic fields in the F1 order", () => {
    expect(PERSONAL_DRAFT_FIELDS).toEqual([
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
    ])
    expect(Object.keys(PERSONAL_LABELS)).toEqual([...PERSONAL_DRAFT_FIELDS])
    expect(PERSONAL_DRAFT_FIELDS).toHaveLength(14)
    expect(PERSONAL_DRAFT_FIELDS).not.toContain("socialSecurityNumber")
  })

  it("personalDraftDiff lists the changed fields with their labels", () => {
    expect(personalDraftDiff({ ...VALID, firstName: "Anna", birthDate: "03/09/1987" }, VALID)).toEqual([
      { field: "firstName", label: "First name", mine: "Anna", current: "Ann" },
      { field: "birthDate", label: "Birth date", mine: "03/09/1987", current: "04/15/1990" },
    ])
    expect(personalDraftDiff(VALID, VALID)).toEqual([])
  })

  it("a stored value that is not text reads as empty", () => {
    expect(personalDraftDiff({ ...VALID, race: 7 }, VALID)).toEqual([{ field: "race", label: "Race", mine: "", current: "Asian" }])
  })
})
