import { describe, expect, it } from "vitest"
import { toContactPoints } from "@/lib/api"
import { contactPointWire } from "@/test/myself-fixture"
import { accountFormDefaults } from "./schema"
import { primaryOptions, primarySelection, restorePrimaryDraft } from "./primary-contacts"
const rows = (overrides: readonly Record<string, unknown>[]) => toContactPoints(overrides.map((row) => contactPointWire(row)))!
describe("Account primary choices", () => {
  it("excludes the current even unverified, dedupes case-insensitive email and retains row order", () => {
    const options = primaryOptions("Email", "a@example.com", rows([
      { type: "Email", value: "A@example.com", isVerified: false },
      { type: "Email", value: "b@example.com" }, { type: "Email", value: "B@example.com" },
      { type: "Email", value: "c@example.com", isVerified: false }, { type: "Email", value: null },
    ]))
    expect(options.map((option) => option.value)).toEqual(["b@example.com"])
  })
  it("allows only verified Mobile rows, formats choices and preserves region casing", () => {
    const contacts = rows([{ value: "4155552671", isVerified: false }, { type: "Landline", value: "4155551111" }, { type: "Mobile", value: "4155552222", phoneNumberRegion: "US" }, { type: null, value: "4155553333", phoneNumberRegion: null }, { type: "Mobile", value: "4155552222" }])
    expect(primaryOptions("Mobile", "4155552671", contacts)).toEqual([
      { value: "4155552222", label: "+1 (415) 555-2222", region: "US" },
      { value: "4155553333", label: "+1 (415) 555-3333", region: "us" },
    ])
    expect(primarySelection("Mobile", "4155551111", "4155552671", contacts)).toBeUndefined()
    expect(primaryOptions("Mobile", "4155552222", contacts)).toHaveLength(1)
  })
  it("defers draft restore until changed-primary reads resolve and falls back only unavailable changes", () => {
    const base = { ...accountFormDefaults(), primaryEmail: "a@example.com", primaryPhone: "4155552671" }
    const draft = { ...base, firstName: "Bea", primaryEmail: "gone@example.com", primaryPhone: "4155552222" }
    const mobile = rows([{ value: "4155552222" }])
    expect(restorePrimaryDraft(draft, base, { mobile })).toBeNull()
    expect(restorePrimaryDraft(draft, base, { email: [], mobile })).toEqual({ ...draft, primaryEmail: base.primaryEmail })
    expect(restorePrimaryDraft(draft, base, { email: [], mobile: [] })).toEqual({ ...draft, primaryEmail: base.primaryEmail, primaryPhone: base.primaryPhone })
  })
})

it("requires only changed primary dependencies when restoring unrelated values", () => {
  const baseline = { ...accountFormDefaults(), primaryEmail: "a@example.com", primaryPhone: "4155552671" }
  expect(restorePrimaryDraft({ ...baseline, firstName: "Bea" }, baseline, {})).toEqual({ ...baseline, firstName: "Bea" })
  expect(restorePrimaryDraft({ ...baseline, primaryEmail: "b@example.com" }, baseline, {})).toBeNull()
  expect(restorePrimaryDraft({ ...baseline, primaryEmail: "b@example.com" }, baseline, { email: rows([{ type: "Email", value: "b@example.com" }]) })).toEqual({ ...baseline, primaryEmail: "b@example.com" })
})
