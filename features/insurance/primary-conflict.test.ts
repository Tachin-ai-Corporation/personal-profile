import { afterEach, describe, expect, it, vi } from "vitest"
import { insuranceUpdateBody, type InsurancePolicy, type InsuranceSubscriber } from "@/lib/api"
import { INSURANCE_MESSAGES } from "@/lib/shared/messages"
import { insuranceConflictName, insuranceDemotionInput, insuranceDemotionLacksPolicyholder, insuranceJoinNames, insurancePrimaryConflicts } from "./primary-conflict"

/** Story 5.4: the Primary conflict and the demotion's body. */

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
  insurer: "Blue Shield",
  insurerId: 7,
  subscriber: null,
  memberId: "948221037",
  groupId: "n/a",
  effectiveDate: "2025-01-01",
  expirationDate: "1970-01-01",
  cancellationDate: "1970-01-01",
  cardFileIds: { front: null, back: null },
  ...overrides,
})

const BLUE = policy()
const DELTA = policy({ id: 56, type: "DENTAL", insurer: "Delta Dental", insurerId: 9 })
const AETNA = policy({ id: 57, insurer: "Aetna", insurerId: 11 })
const CIGNA = policy({ id: 58, insurer: "Cigna", insurerId: 12 })

describe("insurancePrimaryConflicts", () => {
  it("Add, Medical + Primary, Blue Shield is Primary Medical: Blue Shield", () => {
    expect(insurancePrimaryConflicts([BLUE, DELTA], null, "MEDICAL", "PRIMARY")).toEqual([BLUE])
  })

  it.each([
    ["another precedence", [BLUE], "MEDICAL", "SECONDARY"],
    ["no precedence yet", [BLUE], "MEDICAL", ""],
    ["no type yet", [BLUE], "", "PRIMARY"],
    ["only a Dental Primary", [DELTA], "MEDICAL", "PRIMARY"],
    ["the Medical Primary is Deleted", [policy({ deleted: true })], "MEDICAL", "PRIMARY"],
    ["the Medical policy is Secondary", [policy({ precedence: "SECONDARY" })], "MEDICAL", "PRIMARY"],
    ["no list", undefined, "MEDICAL", "PRIMARY"],
  ] as const)("none: %s", (_label, policies, type, precedence) => {
    expect(insurancePrimaryConflicts(policies, null, type, precedence)).toEqual([])
  })

  it("compares the saved values trimmed", () => {
    const padded = policy({ type: " MEDICAL ", precedence: " PRIMARY " })
    expect(insurancePrimaryConflicts([padded], null, "MEDICAL", "PRIMARY")).toEqual([padded])
  })

  it("editing the current Primary, type unchanged: none (even with a legacy second Primary)", () => {
    expect(insurancePrimaryConflicts([BLUE], 55, "MEDICAL", "PRIMARY")).toEqual([])
    expect(insurancePrimaryConflicts([BLUE, AETNA], 55, "MEDICAL", "PRIMARY")).toEqual([])
  })

  it("editing a Primary Dental changed to Medical: the Medical Primary, never the edited one", () => {
    expect(insurancePrimaryConflicts([BLUE, DELTA], 56, "MEDICAL", "PRIMARY")).toEqual([BLUE])
  })

  it("editing a Secondary Medical made Primary: the Medical Primary", () => {
    const secondary = policy({ id: 59, precedence: "SECONDARY", insurer: "Humana" })
    expect(insurancePrimaryConflicts([BLUE, secondary], 59, "MEDICAL", "PRIMARY")).toEqual([BLUE])
  })

  it("editing a policy the list doesn't hold: every Primary of the type but that id", () => {
    expect(insurancePrimaryConflicts([BLUE, AETNA], 99, "MEDICAL", "PRIMARY")).toEqual([BLUE, AETNA])
  })

  it("legacy data: every Primary of the type, in list order", () => {
    expect(insurancePrimaryConflicts([AETNA, DELTA, CIGNA], null, "MEDICAL", "PRIMARY")).toEqual([AETNA, CIGNA])
  })
})

describe("insuranceDemotionInput", () => {
  it("the saved values with only the precedence changed: the full PUT body", () => {
    const input = insuranceDemotionInput(policy({ groupId: "704512", expirationDate: "2026-12-31" }))
    expect(input).not.toBeNull()
    expect(insuranceUpdateBody(input!)).toEqual({
      insuranceOrganizationDTO: { insuranceCompanyId: 7 },
      insuranceType: "MEDICAL",
      insurancePrecedence: "SECONDARY",
      relationshipToInsured: "SELF",
      memberIdNumber: "948221037",
      insuranceGroupId: "704512",
      planEffectiveDate: "2025-01-01",
      expirationDate: "2026-12-31",
    })
  })

  it("Primary again for a rollback (decision 2A)", () => {
    expect(insuranceDemotionInput(BLUE, "PRIMARY")?.precedence).toBe("PRIMARY")
  })

  it("a non-Self policy sends its saved subscriber, unchanged (never typed)", () => {
    const spouse = policy({ relationship: "SPOUSE", subscriber: SAM })
    expect(insuranceDemotionInput(spouse)?.subscriber).toEqual(SAM)
  })

  it("an insurer without an id goes by name", () => {
    expect(insuranceDemotionInput(policy({ insurerId: null }))?.insurer).toEqual({ name: "Blue Shield" })
  })

  describe("never depends on today", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("the same body on any date, even for a subscriber who would be under 18 or over 120 then", () => {
      const spouse = policy({ relationship: "SPOUSE", subscriber: { ...SAM, birthDate: "2020-01-01" } })
      const bodies = ["1990-06-01", "2026-10-21", "2200-01-01"].map((date) => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date(`${date}T12:00:00`))
        const input = insuranceDemotionInput(spouse)
        vi.useRealTimers()
        return input
      })
      expect(bodies[0]).not.toBeNull()
      expect(bodies[1]).toEqual(bodies[0])
      expect(bodies[2]).toEqual(bodies[0])
    })
  })

  it.each([
    ["no id", policy({ id: null })],
    ["a non-positive id", policy({ id: 0 })],
    ["an N_A type", policy({ type: "N_A" })],
    ["an N_A relationship", policy({ relationship: "N_A" })],
    ["a missing Member ID", policy({ memberId: null })],
    ["a too short Member ID", policy({ memberId: "AB" })],
    ["no insurer", policy({ insurer: null })],
    ["no effective date", policy({ effectiveDate: null })],
    ["dates out of order", policy({ expirationDate: "2024-01-01" })],
    ["a non-Self policy without a saved subscriber", policy({ relationship: "SPOUSE", subscriber: null })],
  ])("null (nothing can be sent): %s", (_label, other) => {
    expect(insuranceDemotionInput(other)).toBeNull()
  })
})

describe("insuranceDemotionLacksPolicyholder", () => {
  it.each([
    ["a Spouse policy without a saved subscriber", policy({ relationship: "SPOUSE", subscriber: null }), true],
    ["a Spouse policy with one", policy({ relationship: "SPOUSE", subscriber: SAM }), false],
    ["a Self policy", BLUE, false],
    ["an N_A relationship", policy({ relationship: "N_A" }), false],
  ])("%s: %s", (_label, other, lacks) => {
    expect(insuranceDemotionLacksPolicyholder(other)).toBe(lacks)
  })
})

describe("names", () => {
  it("the insurer, or the policy title without one", () => {
    expect(insuranceConflictName(BLUE)).toBe("Blue Shield")
    expect(insuranceConflictName(policy({ insurer: "  Aetna " }))).toBe("Aetna")
    expect(insuranceConflictName(policy({ insurer: null }))).toBe("Medical Insurance")
    expect(insuranceConflictName(policy({ insurer: "n/a" }))).toBe("Medical Insurance")
  })

  it.each([
    [[], ""],
    [["Aetna"], "Aetna"],
    [["Aetna", "Cigna"], "Aetna and Cigna"],
    [["Aetna", "Cigna", "Humana"], "Aetna, Cigna and Humana"],
    [["Aetna", "Aetna"], "Aetna"],
    [["Aetna", "Cigna", "Aetna"], "Aetna and Cigna"],
  ])("joins %j as %j", (names, joined) => {
    expect(insuranceJoinNames(names)).toBe(joined)
  })

  it("takes its separators from the catalog", () => {
    expect(INSURANCE_MESSAGES.insurerListSeparator).toBe(", ")
    expect(INSURANCE_MESSAGES.insurerList).toBe("{insurers} and {last}")
  })
})
