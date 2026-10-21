import { describe, expect, it } from "vitest"
import { EMPTY_PHONE_INPUT } from "@/lib/shared/phone"
import { insuranceSchema, needsSubscriber, type InsuranceFormValues, type InsuranceSchemaContext } from "./schema"

/** Story 5.2: the editor's rules (spec 5.2 Validation). */

const TODAY = new Date(2026, 9, 20)
const CONTEXT: InsuranceSchemaContext = { ownEmail: "Avery@Example.com", subscriberLocked: false, today: TODAY }

/** A valid Self policy (every optional field filled). */
const valid = (overrides: Partial<InsuranceFormValues> = {}): InsuranceFormValues => ({
  insurer: { id: 7, name: "Blue Shield" },
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  memberId: "XKH123",
  groupId: "704512",
  effectiveDate: "01/01/2025",
  expirationDate: "12/31/2026",
  cancellationDate: "06/30/2026",
  subscriberFirstName: "",
  subscriberLastName: "",
  subscriberEmail: "",
  subscriberPhone: EMPTY_PHONE_INPUT,
  subscriberBirthDate: "",
  ...overrides,
})

/** A valid Spouse policy with an editable subscriber. */
const spouse = (overrides: Partial<InsuranceFormValues> = {}): InsuranceFormValues =>
  valid({
    relationship: "SPOUSE",
    subscriberFirstName: "Sam",
    subscriberLastName: "Lee",
    subscriberEmail: "sam@example.com",
    subscriberPhone: { region: "us", national: "(415) 555-2125" },
    subscriberBirthDate: "05/04/1980",
    ...overrides,
  })

/** `{ field: message }` of every issue (the first per field). */
function issues(values: InsuranceFormValues, context: InsuranceSchemaContext = CONTEXT): Record<string, string> {
  const parsed = insuranceSchema(context).safeParse(values)
  if (parsed.success) return {}
  const found: Record<string, string> = {}
  for (const issue of parsed.error.issues) found[String(issue.path[0])] ??= issue.message
  return found
}

describe("insuranceSchema (Story 5.2)", () => {
  it("accepts a full Self policy, the required fields only, a new insurer and a valid subscriber", () => {
    expect(issues(valid())).toEqual({})
    expect(issues(valid({ groupId: "", expirationDate: "", cancellationDate: "" }))).toEqual({})
    expect(issues(valid({ insurer: { id: null, name: "Acme Health" } }))).toEqual({})
    expect(issues(spouse())).toEqual({})
    expect(issues(valid({ type: "DRUG", precedence: "OTHER" }))).toEqual({})
  })

  it("requires the insurer, the three choices, Member ID and the Effective date", () => {
    expect(
      issues(valid({ insurer: null, type: "", precedence: "", relationship: "", memberId: "  ", effectiveDate: "" })),
    ).toEqual({
      insurer: "Choose your insurer",
      type: "Choose a value",
      precedence: "Choose a value",
      relationship: "Choose a value",
      memberId: "Member ID is required",
      effectiveDate: "Effective date is required",
    })
    expect(issues(valid({ insurer: { id: null, name: "  " } }))).toEqual({ insurer: "Choose your insurer" })
    // A value the backend doesn't take (N_A, or anything unknown) is no choice.
    expect(issues(valid({ type: "N_A", precedence: "FIRST", relationship: "N_A" }))).toEqual({
      type: "Choose a value",
      precedence: "Choose a value",
      relationship: "Choose a value",
    })
  })

  it("Member ID 3–32 characters trimmed; Group ID too when filled", () => {
    expect(issues(valid({ memberId: " AB " }))).toEqual({ memberId: "Member ID must be 3 to 32 characters" })
    expect(issues(valid({ memberId: "a".repeat(33) }))).toEqual({ memberId: "Member ID must be 3 to 32 characters" })
    expect(issues(valid({ memberId: ` ${"a".repeat(32)} ` }))).toEqual({})
    expect(issues(valid({ groupId: "ab" }))).toEqual({ groupId: "Group ID must be 3 to 32 characters" })
    expect(issues(valid({ groupId: "a".repeat(33) }))).toEqual({ groupId: "Group ID must be 3 to 32 characters" })
    expect(issues(valid({ groupId: "   " }))).toEqual({})
  })

  it("dates: real MM/DD/YYYY; Expiration and Cancellation after Effective; Cancellation before Expiration", () => {
    expect(issues(valid({ effectiveDate: "02/30/2025", expirationDate: "13/01/2026", cancellationDate: "06/3" }))).toEqual({
      effectiveDate: "Enter a date as MM/DD/YYYY",
      expirationDate: "Enter a date as MM/DD/YYYY",
      cancellationDate: "Enter a date as MM/DD/YYYY",
    })
    expect(issues(valid({ expirationDate: "01/01/2025", cancellationDate: "" }))).toEqual({ expirationDate: "Expiration must be after the effective date" })
    expect(issues(valid({ expirationDate: "12/31/2024", cancellationDate: "" }))).toEqual({ expirationDate: "Expiration must be after the effective date" })
    expect(issues(valid({ cancellationDate: "01/01/2025" }))).toEqual({ cancellationDate: "Cancellation must be after the effective date" })
    expect(issues(valid({ cancellationDate: "12/31/2026" }))).toEqual({ cancellationDate: "Cancellation must be before expiration" })
    expect(issues(valid({ cancellationDate: "01/15/2027" }))).toEqual({ cancellationDate: "Cancellation must be before expiration" })
    // Without an Effective date (or Expiration), the order rules have nothing to compare.
    expect(issues(valid({ effectiveDate: "", cancellationDate: "01/01/2020" }))).toEqual({ effectiveDate: "Effective date is required" })
    expect(issues(valid({ expirationDate: "", cancellationDate: "01/15/2027" }))).toEqual({})
  })

  it("Self needs no subscriber; the typed subscriber is ignored", () => {
    expect(issues(valid({ subscriberEmail: "avery@example.com", subscriberFirstName: "a".repeat(30) }))).toEqual({})
  })

  it("Relationship ≠ Self: all five subscriber fields are required", () => {
    expect(
      issues(spouse({ subscriberFirstName: " ", subscriberLastName: "", subscriberEmail: "", subscriberPhone: EMPTY_PHONE_INPUT, subscriberBirthDate: "" })),
    ).toEqual({
      subscriberFirstName: "First name is required",
      subscriberLastName: "Last name is required",
      subscriberEmail: "Email is required",
      subscriberPhone: "Phone is required",
      subscriberBirthDate: "Birth date is required",
    })
  })

  it("subscriber names up to 24 characters, printable only", () => {
    expect(issues(spouse({ subscriberFirstName: "a".repeat(25), subscriberLastName: "b".repeat(25) }))).toEqual({
      subscriberFirstName: "First name can be up to 24 characters",
      subscriberLastName: "Last name can be up to 24 characters",
    })
    expect(issues(spouse({ subscriberFirstName: "Sam\u0007" }))).toEqual({ subscriberFirstName: "Use letters, spaces and standard punctuation only" })
  })

  it("subscriber email: valid, and never the user's own (case-insensitive)", () => {
    expect(issues(spouse({ subscriberEmail: "sam@" }))).toEqual({ subscriberEmail: "Enter a valid email address" })
    expect(issues(spouse({ subscriberEmail: " avery@example.COM " }))).toEqual({ subscriberEmail: "Use the subscriber's email, not yours" })
    expect(issues(spouse({ subscriberEmail: "avery@example.com" }), { ...CONTEXT, ownEmail: null })).toEqual({})
  })

  it("subscriber phone: 10 digits for +1 regions, a valid number elsewhere", () => {
    expect(issues(spouse({ subscriberPhone: { region: "us", national: "415 555" } }))).toEqual({ subscriberPhone: "Enter a 10-digit US number" })
    expect(issues(spouse({ subscriberPhone: { region: "gb", national: "123" } }))).toEqual({ subscriberPhone: "Enter a valid phone number" })
    expect(issues(spouse({ subscriberPhone: { region: "gb", national: "020 7946 0018" } }))).toEqual({})
  })

  it("subscriber birth date: a real date giving an age of 18–120", () => {
    expect(issues(spouse({ subscriberBirthDate: "02/30/1980" }))).toEqual({ subscriberBirthDate: "Enter a date as MM/DD/YYYY" })
    // 17 (turns 18 tomorrow) is refused; 18 today is accepted.
    expect(issues(spouse({ subscriberBirthDate: "10/21/2008" }))).toEqual({ subscriberBirthDate: "You must be 18 to 120 years old" })
    expect(issues(spouse({ subscriberBirthDate: "10/20/2008" }))).toEqual({})
    expect(issues(spouse({ subscriberBirthDate: "10/19/1906" }))).toEqual({ subscriberBirthDate: "You must be 18 to 120 years old" })
  })

  it("a locked subscriber (decision 2C) skips the subscriber rules", () => {
    expect(issues(spouse({ subscriberEmail: "avery@example.com", subscriberBirthDate: "" }), { ...CONTEXT, subscriberLocked: true })).toEqual({})
  })
})

describe("needsSubscriber", () => {
  it("is true for a chosen relationship other than Self", () => {
    expect(needsSubscriber("SPOUSE")).toBe(true)
    expect(needsSubscriber("SELF")).toBe(false)
    expect(needsSubscriber("")).toBe(false)
    expect(needsSubscriber("N_A")).toBe(false)
  })
})
