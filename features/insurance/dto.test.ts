import { describe, expect, it } from "vitest"
import { insuranceCreateBody, type InsurancePolicy, type InsuranceSubscriber } from "@/lib/api"
import { EMPTY_PHONE_INPUT } from "@/lib/shared/phone"
import { EMPTY_INSURANCE_FORM, insuranceLockedSubscriber, toInsuranceFormValues, toInsurancePolicyInput } from "./dto"
import type { InsuranceFormValues } from "./schema"

/** Story 5.2: a saved policy as the editor's opening values, and the values as the saved policy. */

const SAM: InsuranceSubscriber = {
  firstName: "Sam",
  lastName: "Lee",
  email: "sam@example.com",
  phoneNumber: "+14155552125",
  phoneNumberRegion: "us",
  birthDate: "1980-05-04",
}

const policy = (overrides: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 55,
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  deleted: false,
  insurer: "UnitedHealthcare",
  insurerId: 7,
  subscriber: null,
  memberId: "948221037",
  groupId: "704512",
  effectiveDate: "2025-01-01",
  expirationDate: "2026-12-31",
  cancellationDate: "2026-06-30",
  cardFileIds: { front: 900, back: 901 },
  ...overrides,
})

describe("toInsuranceFormValues (Story 5.2)", () => {
  it("Add opens empty", () => {
    expect(toInsuranceFormValues(null)).toBe(EMPTY_INSURANCE_FORM)
    expect(EMPTY_INSURANCE_FORM.subscriberPhone).toEqual(EMPTY_PHONE_INPUT)
  })

  it("Edit pre-fills every field; dates as MM/DD/YYYY", () => {
    expect(toInsuranceFormValues(policy())).toEqual({
      insurer: { id: 7, name: "UnitedHealthcare" },
      type: "MEDICAL",
      precedence: "PRIMARY",
      relationship: "SELF",
      memberId: "948221037",
      groupId: "704512",
      effectiveDate: "01/01/2025",
      expirationDate: "12/31/2026",
      cancellationDate: "06/30/2026",
      subscriberFirstName: "",
      subscriberLastName: "",
      subscriberEmail: "",
      subscriberPhone: EMPTY_PHONE_INPUT,
      subscriberBirthDate: "",
    })
  })

  it("loads the backend placeholders and N_A as empty", () => {
    expect(
      toInsuranceFormValues(
        policy({ expirationDate: "1970-01-01", cancellationDate: "1970-01-01", groupId: "n/a", type: "N_A", precedence: null, relationship: "N_A", memberId: "n/a" }),
      ),
    ).toMatchObject({ expirationDate: "", cancellationDate: "", groupId: "", type: "", precedence: "", relationship: "", memberId: "" })
  })

  it("an insurer without an id is kept by name; none at all is no insurer", () => {
    expect(toInsuranceFormValues(policy({ insurerId: null })).insurer).toEqual({ id: null, name: "UnitedHealthcare" })
    expect(toInsuranceFormValues(policy({ insurerId: 0 })).insurer).toEqual({ id: null, name: "UnitedHealthcare" })
    expect(toInsuranceFormValues(policy({ insurer: " n/a " })).insurer).toBeNull()
  })

  it("a non-Self policy shows its saved subscriber", () => {
    expect(toInsuranceFormValues(policy({ relationship: "SPOUSE", subscriber: SAM }))).toMatchObject({
      subscriberFirstName: "Sam",
      subscriberLastName: "Lee",
      subscriberEmail: "sam@example.com",
      subscriberPhone: { region: "us", national: "(415) 555-2125" },
      subscriberBirthDate: "05/04/1980",
    })
    // A Self policy's platform subscriber (the user) never fills the fields.
    expect(toInsuranceFormValues(policy({ subscriber: SAM })).subscriberFirstName).toBe("")
  })
})

describe("insuranceLockedSubscriber (decision 2C)", () => {
  it("is the saved subscriber of a policy saved with a relationship other than Self", () => {
    expect(insuranceLockedSubscriber(policy({ relationship: "CHILD", subscriber: SAM }))).toBe(SAM)
    expect(insuranceLockedSubscriber(policy({ relationship: "SELF", subscriber: SAM }))).toBeNull()
    expect(insuranceLockedSubscriber(policy({ relationship: "N_A", subscriber: SAM }))).toBeNull()
    expect(insuranceLockedSubscriber(policy({ relationship: "SPOUSE", subscriber: null }))).toBeNull()
    expect(insuranceLockedSubscriber(null)).toBeNull()
  })
})

const values = (overrides: Partial<InsuranceFormValues> = {}): InsuranceFormValues => ({
  ...toInsuranceFormValues(policy()),
  ...overrides,
})

describe("toInsurancePolicyInput (Story 5.2)", () => {
  it("a listed insurer by id, trimmed ids, wire dates; Self sends no subscriber", () => {
    expect(toInsurancePolicyInput(values({ memberId: " XKH123 ", groupId: " ", expirationDate: "" }), null)).toEqual({
      insurer: { id: 7 },
      type: "MEDICAL",
      precedence: "PRIMARY",
      relationship: "SELF",
      memberId: "XKH123",
      groupId: "",
      effectiveDate: "2025-01-01",
      expirationDate: "",
      cancellationDate: "2026-06-30",
      subscriber: null,
    })
  })

  it("an added insurer by its trimmed name", () => {
    expect(toInsurancePolicyInput(values({ insurer: { id: null, name: " Acme Health " } }), null).insurer).toEqual({ name: "Acme Health" })
    expect(toInsurancePolicyInput(values({ insurer: null }), null).insurer).toEqual({ name: "" })
  })

  it("an editable subscriber: trimmed, the phone as E.164 with its region, the birth date as YYYY-MM-DD", () => {
    const input = toInsurancePolicyInput(
      values({
        relationship: "SPOUSE",
        subscriberFirstName: " Sam ",
        subscriberLastName: " Lee ",
        subscriberEmail: " sam@example.com ",
        subscriberPhone: { region: "us", national: "(415) 555-2125" },
        subscriberBirthDate: "05/04/1980",
      }),
      null,
    )
    expect(input.subscriber).toEqual({ firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" })
    // Invalid values are left out (the rules stop them first).
    expect(toInsurancePolicyInput(values({ relationship: "PARENT", subscriberPhone: EMPTY_PHONE_INPUT, subscriberBirthDate: "05/0" }), null).subscriber).toEqual({
      firstName: "",
      lastName: "",
      email: "",
    })
  })

  it("a locked subscriber is sent back unchanged, whatever the fields hold; Self sends none", () => {
    const locked = values({ relationship: "DEPENDENT", subscriberFirstName: "Changed", subscriberEmail: "x@example.com" })
    expect(toInsurancePolicyInput(locked, SAM).subscriber).toEqual(SAM)
    expect(toInsurancePolicyInput(values({ relationship: "SELF" }), SAM).subscriber).toBeNull()
    const partial: InsuranceSubscriber = { firstName: "Kim", lastName: null, email: "kim@example.com", phoneNumber: "n/a", phoneNumberRegion: "us", birthDate: "1970-01-01" }
    expect(toInsurancePolicyInput(values({ relationship: "CHILD" }), partial).subscriber).toEqual({ firstName: "Kim", lastName: "", email: "kim@example.com", birthDate: "1970-01-01" })
    const noRegion: InsuranceSubscriber = { ...SAM, phoneNumberRegion: null, birthDate: null }
    expect(toInsurancePolicyInput(values({ relationship: "CHILD" }), noRegion).subscriber).toEqual({
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@example.com",
      phoneNumber: "+14155552125",
    })
  })

  it("a saved region that isn't two letters is left out (the proxy would refuse the body)", () => {
    for (const region of ["n/a", "usa", " "]) {
      expect(toInsurancePolicyInput(values({ relationship: "SPOUSE" }), { ...SAM, phoneNumberRegion: region }).subscriber).toEqual({
        firstName: "Sam",
        lastName: "Lee",
        email: "sam@example.com",
        phoneNumber: "+14155552125",
        birthDate: "1980-05-04",
      })
    }
    expect(toInsurancePolicyInput(values({ relationship: "SPOUSE" }), { ...SAM, phoneNumberRegion: " GB " }).subscriber?.phoneNumberRegion).toBe("GB")
  })

  it("an Edit never sends a typed subscriber (decision 3A): no saved one, none sent", () => {
    const typed = values({ relationship: "SPOUSE", subscriberFirstName: "Sam", subscriberLastName: "Lee", subscriberEmail: "sam@example.com" })
    expect(toInsurancePolicyInput(typed, null, false).subscriber).toBeNull()
    expect(toInsurancePolicyInput(typed, SAM, false).subscriber).toEqual(SAM)
    expect(toInsurancePolicyInput(typed, null).subscriber).toMatchObject({ firstName: "Sam" })
  })

  it("round-trips an untouched Edit into the same DTO the policy came from", () => {
    expect(insuranceCreateBody(toInsurancePolicyInput(toInsuranceFormValues(policy()), null))).toEqual({
      insuranceOrganizationDTO: { insuranceCompanyId: 7 },
      insuranceType: "MEDICAL",
      insurancePrecedence: "PRIMARY",
      relationshipToInsured: "SELF",
      memberIdNumber: "948221037",
      insuranceGroupId: "704512",
      planEffectiveDate: "2025-01-01",
      expirationDate: "2026-12-31",
      cancellationDate: "2026-06-30",
    })
  })
})
