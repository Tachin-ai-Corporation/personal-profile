import { describe, expect, it } from "vitest"
import { toMyself } from "@/lib/api"
import { myselfWire } from "@/test/myself-fixture"
import { ACCOUNT_DRAFT_FIELDS, accountFormDefaults, accountSchema, accountDetailsDiff, accountDraftDiff } from "./schema"

const today = new Date(2026, 9, 19)
const base = { primaryEmail: "ann.lee@example.com", primaryPhone: "+14155552671", firstName: "Ann", lastName: "Lee", birthDate: "04/15/1990", preferredLanguage: "en", timeZone: "America/Chicago", locale: "en-US" }
describe("Account form rules", () => {
  it.each([["10/19/2008", true], ["10/20/2008", false], ["10/19/1906", true], ["10/18/1906", false], ["02/29/2000", true], ["02/29/2001", false], ["02/30/1990", false], ["", false], ["12/01/2030", false]])("validates date %s", (birthDate, valid) => {
    expect(accountSchema([], today).safeParse({ ...base, birthDate }).success).toBe(valid)
  })
  it("applies the Proctor boundary and leap birthdays", () => {
    expect(accountSchema(["Proctor"], today).safeParse({ ...base, birthDate: "10/19/2005" }).success).toBe(true)
    expect(accountSchema(["Proctor"], today).safeParse({ ...base, birthDate: "10/20/2005" }).success).toBe(false)
    expect(accountSchema([], new Date(2026, 1, 28)).safeParse({ ...base, birthDate: "02/29/2008" }).success).toBe(false)
    expect(accountSchema([], new Date(2026, 2, 1)).safeParse({ ...base, birthDate: "02/29/2008" }).success).toBe(true)
  })
  it.each(["", " ", "x".repeat(25), "A😀", "A\u200b"]) ("rejects invalid names %s", (firstName) => {
    expect(accountSchema([], today).safeParse({ ...base, firstName }).success).toBe(false)
  })
  it("trims names in changed-only payloads and preserves unlisted choices", () => {
    const values = { ...base, firstName: " José ", preferredLanguage: "es", timeZone: "Europe/Paris", locale: "fr-FR" }
    expect(accountSchema([], today).safeParse(values).success).toBe(true)
    expect(accountDetailsDiff(values, base)).toEqual({ firstName: "José", preferredLanguage: "es" })
    expect(accountDetailsDiff({ ...base, firstName: " Ann " }, base)).toEqual({})
    for (const field of ["preferredLanguage", "timeZone", "locale"]) expect(accountSchema([], today).safeParse({ ...base, [field]: "" }).success).toBe(false)
  })
  it("keeps raw invalid-age dates, defaults locale and limits drafts to eight fields", () => {
    const myself = toMyself(myselfWire({ birthDate: "2020-01-01", locale: "" }))!
    expect(accountFormDefaults(myself)).toMatchObject({ birthDate: "01/01/2020", locale: "en-US" })
    expect(accountDetailsDiff(accountFormDefaults(myself), accountFormDefaults(myself))).toEqual({})
    expect(ACCOUNT_DRAFT_FIELDS).toEqual(["firstName", "lastName", "birthDate", "preferredLanguage", "timeZone", "locale", "primaryEmail", "primaryPhone"])
    expect(accountDraftDiff({ ...base, firstName: "Bea" }, base)).toEqual([{ field: "firstName", label: "First name", mine: "Bea", current: "Ann" }])
  })
})

it.each(["n/a", "N/A", " -1 ", "   "])("treats PM3 withheld values %s as missing, including default locale", (withheld) => {
  const myself = toMyself(myselfWire({ firstName: withheld, lastName: withheld, birthDate: withheld, preferredLanguage: withheld, timeZone: withheld, locale: withheld }))!
  expect(accountFormDefaults(myself)).toEqual({ primaryEmail: "ann.lee@example.com", primaryPhone: "+14155552671", firstName: "", lastName: "", birthDate: "", preferredLanguage: "", timeZone: "", locale: "en-US" })
})

it("validates primary email format and required phone with exact copy", () => {
  const parsed = accountSchema([], today).safeParse({ ...base, primaryEmail: "malformed", primaryPhone: "" })
  expect(parsed.success).toBe(false)
  if (!parsed.success) expect(parsed.error.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: ["primaryEmail"], message: "Invalid email address" }),
    expect.objectContaining({ path: ["primaryPhone"], message: "Primary phone is required" }),
  ]))
})

it("rejects changed selections after failed, unresolved or no-longer-verified lists while permitting unchanged contacts", () => {
  const changed = { ...base, primaryEmail: "gone@example.com", primaryPhone: "+442071838750", timeZone: "America/New_York" }
  for (const contacts of [{}, { email: [], mobile: [] }]) {
    const schema = accountSchema([], today, { baseline: base, contacts })
    expect(schema.safeParse({ ...base, firstName: "Bea" }).success).toBe(true)
    const result = schema.safeParse(changed)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(["primaryEmail", "primaryPhone"])
  }
})

it.each(["n/a", " N/A ", "-1", " -1 "])("rejects edited required names containing absence sentinel %s", (value) => {
  for (const field of ["firstName", "lastName"] as const) {
    const result = accountSchema([], today).safeParse({ ...base, [field]: value })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: [field], message: field === "firstName" ? "First name is required" : "Last name is required" }))
  }
})
