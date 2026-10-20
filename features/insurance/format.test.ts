import { describe, expect, it } from "vitest"
import { toMyself, type InsurancePolicy, type Myself } from "@/lib/api"
import { myselfWire } from "@/test/myself-fixture"
import {
  INSURANCE_NO_DATE,
  insuranceActiveCount,
  insuranceChip,
  insuranceDisplayDate,
  insuranceEnumLabel,
  insuranceGridRows,
  insurancePolicyName,
  insurancePolicyTitle,
  insuranceSideLabel,
  insuranceSubscriberName,
  insuranceWireDate,
  sortInsurancePolicies,
} from "./format"

const policy = (overrides: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 55,
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  deleted: false,
  insurer: "UnitedHealthcare",
  subscriber: null,
  memberId: "948221037",
  groupId: "704512",
  effectiveDate: "2025-01-01",
  expirationDate: "2026-12-31",
  cancellationDate: null,
  cardFileIds: { front: 900, back: 901 },
  ...overrides,
})

const AVERY = toMyself(myselfWire({ firstName: "Avery", lastName: "Lee" })) as Myself

describe("insurance dates (Story 5.1)", () => {
  it("shows MM/DD/YYYY", () => {
    expect(insuranceDisplayDate("2025-01-01")).toBe("01/01/2025")
    expect(insuranceDisplayDate(" 2026-12-31 ")).toBe("12/31/2026")
  })

  it.each([null, "", "  ", "n/a", "N/A", INSURANCE_NO_DATE, "not a date", "2025-02-30", "2025-1-1", "2025-01-01T00:00:00", "2025-01-01T00:00:00Z"])(
    "reads %j as not provided",
    (value) => {
      expect(insuranceDisplayDate(value)).toBeNull()
      expect(insuranceWireDate(value)).toBeNull()
    },
  )

  it("applies the sentinel only to the optional dates: an Effective 1970-01-01 is a real date", () => {
    expect(insuranceWireDate(INSURANCE_NO_DATE, "effective")).toBe(INSURANCE_NO_DATE)
    expect(insuranceDisplayDate(INSURANCE_NO_DATE, "effective")).toBe("01/01/1970")
    expect(insuranceWireDate("2025-01-01T00:00:00", "effective")).toBeNull()
    expect(insuranceWireDate("n/a", "effective")).toBeNull()
  })

  it("loads the sentinel, empty and n/a as no date (the editor's empty value)", () => {
    expect(INSURANCE_NO_DATE).toBe("1970-01-01")
    expect(insuranceWireDate(INSURANCE_NO_DATE)).toBeNull()
    expect(insuranceWireDate("n/a")).toBeNull()
    expect(insuranceWireDate(null)).toBeNull()
    expect(insuranceWireDate(" 2025-01-01 ")).toBe("2025-01-01")
    expect(insuranceWireDate("1970-01-02")).toBe("1970-01-02")
  })
})

describe("insuranceEnumLabel", () => {
  it.each([
    ["MEDICAL", "Medical"],
    ["DENTAL", "Dental"],
    ["HOSPICE", "Hospice"],
    ["VISION", "Vision"],
    ["DRUG", "Drug"],
    ["SUPPLEMENTAL", "Supplemental"],
    ["SOME_THING", "Some thing"],
  ])("%s → %s", (value, label) => {
    expect(insuranceEnumLabel(value)).toBe(label)
  })

  it.each([null, "", "N_A", "n/a"])("%j → null", (value) => {
    expect(insuranceEnumLabel(value)).toBeNull()
  })
})

describe("title and name", () => {
  it("is \"{Type} Insurance\", or \"Insurance\" for N_A or none", () => {
    expect(insurancePolicyTitle(policy())).toBe("Medical Insurance")
    expect(insurancePolicyTitle(policy({ type: "DRUG" }))).toBe("Drug Insurance")
    expect(insurancePolicyTitle(policy({ type: "N_A" }))).toBe("Insurance")
    expect(insurancePolicyTitle(policy({ type: null }))).toBe("Insurance")
  })

  it("names the policy \"{Insurer} {Type} Insurance\", or by its title without an insurer", () => {
    expect(insurancePolicyName(policy())).toBe("UnitedHealthcare Medical Insurance")
    expect(insurancePolicyName(policy({ insurer: " Aetna " }))).toBe("Aetna Medical Insurance")
    expect(insurancePolicyName(policy({ insurer: null }))).toBe("Medical Insurance")
    expect(insurancePolicyName(policy({ insurer: "n/a", type: "N_A" }))).toBe("Insurance")
  })
})

describe("insuranceChip", () => {
  it("Primary is the filled primary chip; Secondary, Supplemental and Other are label chips", () => {
    expect(insuranceChip(policy())).toEqual({ variant: "primary", label: "Primary" })
    expect(insuranceChip(policy({ precedence: "SECONDARY" }))).toEqual({ variant: "label", label: "Secondary" })
    expect(insuranceChip(policy({ precedence: "SUPPLEMENTAL" }))).toEqual({ variant: "label", label: "Supplemental" })
    expect(insuranceChip(policy({ precedence: "OTHER" }))).toEqual({ variant: "label", label: "Other" })
  })

  it("N_A or none gets no chip; a Deleted policy gets the deleted chip instead", () => {
    expect(insuranceChip(policy({ precedence: "N_A" }))).toBeNull()
    expect(insuranceChip(policy({ precedence: null }))).toBeNull()
    expect(insuranceChip(policy({ deleted: true }))).toEqual({ variant: "deleted", label: "Deleted" })
  })
})

describe("insuranceSubscriberName", () => {
  const sam = { firstName: "Sam", lastName: "Lee" }

  it("Self: the user's own name (the platform's subscriber until myself is there)", () => {
    expect(insuranceSubscriberName(policy({ subscriber: sam }), AVERY)).toBe("Avery Lee")
    expect(insuranceSubscriberName(policy({ subscriber: sam }), undefined)).toBe("Sam Lee")
    expect(insuranceSubscriberName(policy(), undefined)).toBeNull()
  })

  it("anyone else: the subscriber's first + last name", () => {
    expect(insuranceSubscriberName(policy({ relationship: "SPOUSE", subscriber: sam }), AVERY)).toBe("Sam Lee")
    expect(insuranceSubscriberName(policy({ relationship: "CHILD", subscriber: { firstName: "Sam", lastName: "n/a" } }), AVERY)).toBe("Sam")
    expect(insuranceSubscriberName(policy({ relationship: "SPOUSE", subscriber: null }), AVERY)).toBeNull()
  })
})

describe("insuranceGridRows", () => {
  it("lists the seven pairs in order, dates formatted, the sentinel not provided on Expiration and Cancellation only", () => {
    const rows = insuranceGridRows(policy({ effectiveDate: INSURANCE_NO_DATE, expirationDate: INSURANCE_NO_DATE, cancellationDate: INSURANCE_NO_DATE, groupId: "n/a" }), AVERY)
    expect(rows.map((row) => [row.key, row.label, row.value])).toEqual([
      ["insurer", "Insurer", "UnitedHealthcare"],
      ["subscriber", "Subscriber", "Avery Lee"],
      ["memberId", "Member ID", "948221037"],
      ["effective", "Effective", "01/01/1970"],
      ["groupId", "Group ID", "n/a"],
      ["expiration", "Expiration", null],
      ["cancellation", "Cancellation", null],
    ])
  })
})

describe("order and count", () => {
  it("puts active policies first, then Deleted ones, each in platform order; counts only the active ones", () => {
    const rows = [policy({ id: 1, deleted: true }), policy({ id: 2 }), policy({ id: 3, deleted: true }), policy({ id: 4 })]
    expect(sortInsurancePolicies(rows).map((row) => row.id)).toEqual([2, 4, 1, 3])
    expect(insuranceActiveCount(rows)).toBe(2)
    expect(insuranceActiveCount([])).toBe(0)
  })
})

describe("insuranceSideLabel", () => {
  it("captions the sides Front and Back", () => {
    expect(insuranceSideLabel("front")).toBe("Front")
    expect(insuranceSideLabel("back")).toBe("Back")
  })
})
