import { describe, expect, it } from "vitest"
import { contactPointWire, myselfWire } from "./myself-fixture"

/**
 * The unit-test defaults are FROZEN (spec F7-1): both teams' tests assert on
 * them ("Ann Lee", id 42 in draft keys, the Primary Mobile). Never change a
 * default; override per test (`myselfWire({ middleName: "n/a" })`).
 */
describe("frozen unit fixtures", () => {
  it("myselfWire() defaults", () => {
    expect(myselfWire()).toEqual({
      id: 42,
      personId: 4242,
      username: "ann.lee",
      firstName: "Ann",
      middleName: "Marie",
      lastName: "Lee",
      namePrefix: "Dr.",
      nameSuffix: "Jr.",
      otherNames: "Ann Smith",
      titles: "MD",
      birthDate: "1990-04-15",
      cityOfBirth: "Springfield",
      race: "Asian",
      ethnicity: "Not Hispanic or Latino",
      biologicalGender: "Female",
      genderIdentity: "Woman",
      sexualOrientation: "Straight",
      socialSecurityNumber: "***-**-1234",
      signature: { id: 501, name: "signature.png" },
      email: "ann.lee@example.com",
      phoneNumber: "+14155552671",
      roles: ["Patient"],
      preferredLanguage: "en",
      timeZone: "America/Chicago",
      locale: "en-US",
      tenants: [{ id: 7, name: "Acme Clinic" }],
      mfaEnabled: true,
      totpEnabled: false,
    })
  })

  it("contactPointWire() defaults: a verified Primary Mobile", () => {
    expect(contactPointWire()).toEqual({
      id: 1,
      name: null,
      value: "+14155552671",
      type: "Mobile",
      label: "Primary",
      isVerified: true,
      isNotificationEnabled: true,
      phoneNumberRegion: "US",
    })
  })

  it("overrides apply per call and never leak into the defaults", () => {
    expect(myselfWire({ firstName: "Bo" }).firstName).toBe("Bo")
    expect(myselfWire().firstName).toBe("Ann")
  })
})
