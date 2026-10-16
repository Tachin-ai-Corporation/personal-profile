import { describe, expect, it } from "vitest"
import type { ContactPoint } from "@/lib/api"
import {
  arePhoneTypesFull,
  isPhoneTypeFull,
  newPhoneEditRow,
  PHONE_TYPE_LIMIT,
  phoneDraftDiff,
  phoneDraftRows,
  phoneEditRowOf,
  phoneRowE164,
  phoneRowNumber,
  phoneSchema,
  phoneTypeCount,
  phoneTypeLabel,
  type PhoneEditRow,
} from "./phone-schema"

/**
 * Story 3.2 (NG-9023): `phoneSchema` and the Phone edit helpers. Covers the
 * "Invalid" and "Limit" rows of the I/O matrix in
 * `spec-3-2-add-relabel-and-remove-phones.md`.
 */

function point(overrides: Partial<ContactPoint> = {}): ContactPoint {
  return { id: 5, name: null, value: "+14155550105", type: "Mobile", label: "Work", isVerified: true, isNotificationEnabled: false, phoneNumberRegion: "us", ...overrides }
}

const saved = (overrides: Partial<ContactPoint> = {}, type: "Mobile" | "Landline" = "Mobile"): PhoneEditRow => phoneEditRowOf(`${type}-${overrides.id ?? 5}`, type, point(overrides))

const added = (overrides: Partial<PhoneEditRow> = {}): PhoneEditRow => ({
  ...newPhoneEditRow("new-1"),
  phone: { region: "us", national: "4155550101" },
  label: "Work",
  type: "Mobile",
  ...overrides,
})

/** The issues of `rows` as `path: message`. */
function issues(rows: readonly PhoneEditRow[]): string[] {
  const result = phoneSchema.safeParse({ rows })
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}

const many = (count: number, type: "Mobile" | "Landline", start: number, removed = false): PhoneEditRow[] =>
  Array.from({ length: count }, (_, index) => ({ ...saved({ id: start + index, value: `+1415555${String(start + index).padStart(4, "0")}` }, type), removed }))

describe("phoneSchema: numbers", () => {
  it("accepts a valid new row and every saved row as it is", () => {
    expect(issues([saved(), saved({ id: 6, value: "", label: null }), added()])).toEqual([])
  })

  it.each([
    ["a short US number", { region: "us", national: "41555" }, "Enter a 10-digit US number"],
    ["an empty US number", { region: "us", national: "" }, "Enter a 10-digit US number"],
    ["an empty Canadian number (+1)", { region: "ca", national: "" }, "Enter a 10-digit US number"],
    ["an invalid GB number", { region: "gb", national: "123" }, "Enter a valid phone number"],
    ["an empty GB number", { region: "gb", national: "" }, "Enter a valid phone number"],
  ])("%s reads its message at the number", (_case, phone, message) => {
    expect(issues([added({ phone })])).toEqual([`rows.0.phone: ${message}`])
  })

  it("a number equal (as E.164) to any other row, saved, struck through or new, is a duplicate", () => {
    const duplicate = "rows.1.phone: This number is already on your profile"
    expect(issues([saved({ value: "+14155550101" }), added({ phone: { region: "us", national: "(415) 555-0101" } })])).toEqual([duplicate])
    expect(issues([{ ...saved({ value: "+14155550101" }), removed: true }, added()])).toEqual([duplicate])
    // A saved number stored without its country code still compares as E.164.
    expect(issues([saved({ value: "4155550101", phoneNumberRegion: "us" }), added()])).toEqual([duplicate])
    expect(issues([saved({ value: "+442071838750", phoneNumberRegion: "gb" }, "Landline"), added({ phone: { region: "gb", national: "020 7183 8750" } })])).toEqual([duplicate])
    expect(issues([added(), added({ key: "new-2" })])).toEqual(["rows.0.phone: This number is already on your profile", duplicate])
  })

  it("an unparsable saved value compares as written", () => {
    expect(phoneRowE164(saved({ value: "not a number" }))).toBe("not a number")
    expect(issues([saved({ value: "not a number" }), added()])).toEqual([])
  })
})

describe("phoneSchema: label and type", () => {
  it("an empty Label reads \"Choose a label\"; Primary or an unknown label is never pickable", () => {
    for (const label of ["", "Primary", "Partnership Organization"]) expect(issues([added({ label })])).toEqual(["rows.0.label: Choose a label"])
    for (const label of ["Home", "Main", "Old", "Personal", "Mailing List", "Work"]) expect(issues([added({ label })])).toEqual([])
  })

  it("an empty (or unknown) Type reads \"Choose Mobile or Landline\"", () => {
    for (const type of ["", "Email", "Social Media"]) expect(issues([added({ type })])).toEqual(["rows.0.type: Choose Mobile or Landline"])
  })

  it("every rule of a row reports at once, in field order", () => {
    expect(issues([added({ phone: { region: "us", national: "" }, label: "", type: "" })])).toEqual([
      "rows.0.phone: Enter a 10-digit US number",
      "rows.0.label: Choose a label",
      "rows.0.type: Choose Mobile or Landline",
    ])
  })
})

describe("phoneSchema: 20 per type", () => {
  it("a new row past its type's limit reads the limit at its Type; saved rows count first, then new rows in order", () => {
    const full = many(PHONE_TYPE_LIMIT, "Mobile", 300)
    expect(issues([...full, added()])).toEqual([`rows.${PHONE_TYPE_LIMIT}.type: You've reached the limit of 20 phones`])
    expect(issues([...full, added({ type: "Landline" })])).toEqual([])
    const nineteen = many(19, "Mobile", 300)
    expect(issues([...nineteen, added(), added({ key: "new-2", phone: { region: "us", national: "4155550102" } })])).toEqual([
      "rows.20.type: You've reached the limit of 20 phones",
    ])
  })

  it("struck-through rows don't count", () => {
    expect(issues([...many(PHONE_TYPE_LIMIT, "Mobile", 300).map((row, index) => (index === 0 ? { ...row, removed: true } : row)), added()])).toEqual([])
  })
})

describe("phone limit helpers", () => {
  it("counts saved rows not struck through and new rows, per type, optionally without one row", () => {
    const rows = [saved({ id: 1 }), { ...saved({ id: 2 }), removed: true }, saved({ id: 3 }, "Landline"), added()]
    expect(phoneTypeCount(rows, "Mobile")).toBe(2)
    expect(phoneTypeCount(rows, "Landline")).toBe(1)
    expect(phoneTypeCount(rows, "Mobile", "new-1")).toBe(1)
  })

  it("a type is full at 20 without the given row; both full blocks any add", () => {
    const mobile = many(PHONE_TYPE_LIMIT, "Mobile", 300)
    expect(isPhoneTypeFull(mobile, "Mobile")).toBe(true)
    expect(isPhoneTypeFull(mobile, "Mobile", "Mobile-300")).toBe(false)
    expect(isPhoneTypeFull(mobile, "Landline")).toBe(false)
    expect(arePhoneTypesFull(mobile)).toBe(false)
    expect(arePhoneTypesFull([...mobile, ...many(PHONE_TYPE_LIMIT, "Landline", 200)])).toBe(true)
    expect(arePhoneTypesFull([...mobile, ...many(PHONE_TYPE_LIMIT, "Landline", 200, true)])).toBe(false)
  })
})

describe("phone rows", () => {
  it("a saved phone as an edit row: its id, type, label, value and region; never new or removed", () => {
    expect(phoneEditRowOf("Mobile-5-0", "Mobile", point())).toEqual({
      key: "Mobile-5-0",
      id: 5,
      isNew: false,
      type: "Mobile",
      label: "Work",
      value: "+14155550105",
      region: "us",
      phone: { region: "us", national: "" },
      removed: false,
    })
    expect(phoneEditRowOf("k", "Landline", point({ id: null, label: null, value: null, phoneNumberRegion: null }))).toMatchObject({ id: null, label: "", value: "", region: "" })
  })

  it("a new row starts empty in the default region", () => {
    expect(newPhoneEditRow("new-3")).toEqual({ key: "new-3", id: null, isNew: true, type: "", label: "", value: "", region: "", phone: { region: "us", national: "" }, removed: false })
  })

  it("names the types and shows the numbers", () => {
    expect([phoneTypeLabel("Mobile"), phoneTypeLabel("Landline"), phoneTypeLabel("")]).toEqual(["Mobile", "Landline", ""])
    expect(phoneRowNumber(saved({ value: "+442071838750", phoneNumberRegion: "gb" }))).toBe("+44 20 7183 8750")
    expect(phoneRowNumber(added())).toBe("+1 (415) 555-0101")
    expect(phoneRowNumber(added({ phone: { region: "us", national: " 415 " } }))).toBe("415")
  })
})

describe("phone drafts", () => {
  it("reads a draft's rows, and nothing from a malformed one", () => {
    expect(phoneDraftRows([added()])).toEqual([added()])
    for (const value of [undefined, null, "rows", [{ key: 1 }], {}]) expect(phoneDraftRows(value)).toEqual([])
  })

  it("lists each phone whose draft row differs, named by its number", () => {
    const work = saved({ id: 5, label: "Work" })
    const home = saved({ id: 6, value: "+14155550106", label: "Home" })
    const draft = { rows: [{ ...work, label: "Personal" }, { ...home, removed: true }, added()] }
    const current = { rows: [work, home] }
    expect(phoneDraftDiff(draft, current)).toEqual([
      { field: "rows.Mobile-5", label: "+1 (415) 555-0105", mine: "Personal · Mobile", current: "Work · Mobile" },
      { field: "rows.Mobile-6", label: "+1 (415) 555-0106", mine: "Home · Mobile · Removed on save", current: "Home · Mobile" },
      { field: "rows.new-1", label: "+1 (415) 555-0101", mine: "Work · Mobile · New · not saved", current: "" },
    ])
    // A phone the server dropped meanwhile shows with an empty draft side; equal rows don't show.
    expect(phoneDraftDiff({ rows: [] }, current)).toEqual([
      { field: "rows.Mobile-5", label: "+1 (415) 555-0105", mine: "", current: "Work · Mobile" },
      { field: "rows.Mobile-6", label: "+1 (415) 555-0106", mine: "", current: "Home · Mobile" },
    ])
    expect(phoneDraftDiff(current, current)).toEqual([])
    expect(phoneDraftDiff({ rows: [{ ...newPhoneEditRow("new-9"), label: "" }] }, { rows: [] })).toEqual([{ field: "rows.new-9", label: "", mine: "New · not saved", current: "" }])
  })
})
