import { describe, expect, it } from "vitest"
import { nameIssue } from "@/lib/shared/person-rules"
import { BIOLOGICAL_GENDERS, entries, ETHNICITIES, RACES, userEditBodySchema } from "./personal"

const valid = (body: unknown): boolean => userEditBodySchema.safeParse(body).success

describe("PUT v2/user/edit entry", () => {
  it("is the one shared PUT, not a Profile-module entry", () => {
    expect(entries.map((e) => `${e.method} ${e.template}`)).toEqual(["PUT v2/user/edit"])
    expect(entries[0].profile).toBeUndefined()
  })
})

describe("PUT v2/user/edit body (PersonalInformationDTO)", () => {
  it("accepts a full Personal information body and forwards names trimmed", () => {
    const body = {
      firstName: " Ann ",
      middleName: "n/a",
      lastName: "Lee",
      otherNames: "Annie",
      titles: "n/a",
      namePrefix: "Dr.",
      nameSuffix: "Jr.",
      cityOfBirth: "Sofia",
      sexualOrientation: "Prefer not to say",
      genderIdentity: "Female",
      race: "Asian",
      ethnicity: "Not Hispanic or Latino",
      biologicalGender: "Female",
      birthDate: "1990-01-31",
      preferredLanguage: "en",
      socialSecurityNumber: "123-45-6789",
    }
    expect(userEditBodySchema.parse(body)).toEqual({ ...body, firstName: "Ann" })
  })

  it.each(["locale", "username", "enabled", "receiveNotifications", "roleId", "socialSecurityNumberHash"])("rejects %s", (field) => {
    expect(valid({ firstName: "Ann", [field]: "x" })).toBe(false)
    expect(valid({ firstName: "Ann", [field]: true })).toBe(false)
  })

  it.each([
    ["firstName", 24],
    ["middleName", 24],
    ["lastName", 24],
    ["otherNames", 24],
    ["titles", 24],
    ["namePrefix", 10],
    ["nameSuffix", 10],
    ["cityOfBirth", 128],
    ["sexualOrientation", 128],
    ["genderIdentity", 128],
  ] as const)("%s is 1–%i code points after trimming, printable, not blank", (field, max) => {
    expect(valid({ [field]: "x" })).toBe(true)
    expect(valid({ [field]: "x".repeat(max) })).toBe(true)
    expect(valid({ [field]: `  ${"x".repeat(max)}  ` })).toBe(true)
    expect(valid({ [field]: "😀".repeat(max) })).toBe(true)
    expect(valid({ [field]: "x".repeat(max + 1) })).toBe(false)
    expect(valid({ [field]: "" })).toBe(false)
    expect(valid({ [field]: "   " })).toBe(false)
    expect(valid({ [field]: "a​b" })).toBe(false)
    expect(valid({ [field]: 5 })).toBe(false)
  })

  it.each(["Ann", "  Ann  ", "x".repeat(24), ` ${"x".repeat(24)} `, "😀".repeat(24), "😀".repeat(25), "x".repeat(25), "", " ", "A\u0000n", "A​n", "A‮n", "An", "José-María O'Neil"])(
    "agrees with the client name rule for %j",
    (value) => {
      expect(valid({ firstName: value })).toBe(nameIssue(value) === null)
      expect(valid({ lastName: value })).toBe(nameIssue(value) === null)
    },
  )

  it.each([
    ["race", RACES, "Martian"],
    ["ethnicity", ETHNICITIES, "Hispanic or Latina"],
    ["biologicalGender", BIOLOGICAL_GENDERS, "male"],
  ] as const)("%s accepts only the backend enum", (field, values, outside) => {
    for (const value of values) expect(valid({ [field]: value })).toBe(true)
    expect(valid({ [field]: outside })).toBe(false)
    expect(valid({ [field]: "n/a" })).toBe(false)
  })

  it.each([
    [{ birthDate: "1990-01-31" }, true],
    [{ birthDate: "n/a" }, false],
    [{ birthDate: "01/31/1990" }, false],
    [{ socialSecurityNumber: "123-45-6789" }, true],
    [{ socialSecurityNumber: "123456789" }, true],
    [{ socialSecurityNumber: "n/a" }, true],
    [{ socialSecurityNumber: "12-345-6789" }, false],
    [{ socialSecurityNumber: "12345678" }, false],
    [{ socialSecurityNumber: "1234567890" }, false],
    [{ socialSecurityNumber: "123-45-678x" }, false],
    [{ preferredLanguage: "en" }, true],
    [{ preferredLanguage: "fil" }, true],
    [{ preferredLanguage: "en-US" }, true],
    [{ preferredLanguage: "en-us" }, true],
    [{ preferredLanguage: "EN" }, false],
    [{ preferredLanguage: "english" }, false],
    [{ preferredLanguage: "en-USA" }, false],
    [{ preferredLanguage: "en_US" }, false],
    [{ email: "ann@example.com" }, true],
    [{ email: "ann" }, false],
    [{ email: `${"a".repeat(250)}@b.co` }, false],
    [{ phoneNumber: "+14155552125", phoneNumberRegion: "us" }, true],
    [{ phoneNumber: "+44 (20) 7183-8750", phoneNumberRegion: "GB" }, true],
    [{ phoneNumber: "4155", phoneNumberRegion: "us" }, true],
    [{ phoneNumber: "415", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "+1 415 555 2125 ext 9", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "call me", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "++14155552125", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "1".repeat(33), phoneNumberRegion: "us" }, false],
    [{ phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "+14155552125" }, false],
    [{ phoneNumber: "+14155552125", phoneNumberRegion: "usa" }, false],
    [{ phoneNumber: "", phoneNumberRegion: "us" }, false],
  ])("%j → valid: %s", (body, expected) => {
    expect(valid(body)).toBe(expected)
  })
})
