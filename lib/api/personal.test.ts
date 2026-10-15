import { describe, expect, expectTypeOf, it } from "vitest"
import { PERSON_TYPE_KEY, PERSON_VALUE_LISTS, ssnExposePath, type PersonalInformationField, type PersonalInformationPayload } from "."

/** Personal information (Team A, Epic 2). Team A adds its own cases here. */
describe("personal", () => {
  it("paths and constants", () => {
    expect(PERSON_TYPE_KEY).toBe("Person")
    expect(PERSON_VALUE_LISTS).toEqual(["race", "ethnicity", "biologicalGender"])
    expect(ssnExposePath()).toBe("/api/1h/v2/person/me/ssn/expose")
  })

  it("PersonalInformationPayload has exactly the PersonalInformationDTO fields, never email or phone (AD-9, spec F7-2)", () => {
    expectTypeOf<PersonalInformationField>().toEqualTypeOf<
      | "firstName"
      | "middleName"
      | "lastName"
      | "namePrefix"
      | "nameSuffix"
      | "otherNames"
      | "titles"
      | "birthDate"
      | "cityOfBirth"
      | "race"
      | "ethnicity"
      | "biologicalGender"
      | "genderIdentity"
      | "sexualOrientation"
      | "socialSecurityNumber"
    >()
    expectTypeOf<Extract<PersonalInformationField, "email" | "phoneNumber" | "phoneNumberRegion">>().toEqualTypeOf<never>()
    expectTypeOf<PersonalInformationPayload>().toEqualTypeOf<Partial<PersonalInformationPayload>>()
    // @ts-expect-error email is never part of a Personal-information payload
    const withEmail: PersonalInformationPayload = { email: "a@b.co" }
    expect(withEmail).toBeDefined()
  })
})
