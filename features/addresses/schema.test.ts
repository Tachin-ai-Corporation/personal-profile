import { describe, expect, it } from "vitest"
import type { Address } from "@/lib/api"
import {
  addressDraftDiff,
  addressDraftRows,
  addressEditRowOf,
  addressesSchema,
  addressesSchemaWith,
  addressOfEditRow,
  addressRowOneLine,
  isAddressRowChanged,
  isAddressRowSent,
  newAddressEditRow,
  type AddressEditRow,
} from "./schema"

/** Story 4.2 (NG-9026): the Addresses form rows, rules and draft compare. */

/** A saved validated US Home address (the spec's row 2). */
const saved = (overrides: Partial<AddressEditRow> = {}): AddressEditRow => ({
  key: "id-2",
  id: 2,
  isNew: false,
  type: "Home",
  country: "United States",
  line1: "1 Pine St",
  line2: "",
  city: "SF",
  county: "",
  state: "CA",
  zip: "94105",
  primary: false,
  validated: true,
  ...overrides,
})

/** A filled new row (the spec's Add row). */
const added = (overrides: Partial<AddressEditRow> = {}): AddressEditRow => ({ ...newAddressEditRow("new-1"), type: "Home", line1: "2 Elm St", city: "SF", state: "CA", zip: "94105", ...overrides })

/** The issues of `rows` against `savedRows`, as `[index.field, message]`. */
function issues(rows: AddressEditRow[], savedRows: AddressEditRow[] = [saved()], countriesFailed = false): [string, string][] {
  const result = addressesSchemaWith({ saved: savedRows, countriesFailed }).safeParse({ rows })
  return result.success ? [] : result.error.issues.map((issue) => [issue.path.slice(1).join("."), issue.message])
}

describe("address edit rows", () => {
  it("maps a saved address (absent parts as \"\") and makes an empty new row (United States)", () => {
    const address: Address = {
      id: 2,
      type: "Billing",
      addressLine1: "1 Pine St",
      addressLine2: null,
      cityName: "SF",
      county: null,
      stateName: "CA",
      postalCode: "94105",
      country: null,
      countryCode: "US",
      primary: true,
      validated: true,
    }
    expect(addressEditRowOf("id-2", address)).toEqual(saved({ type: "Billing", country: "", primary: true }))
    expect(newAddressEditRow("new-3")).toEqual({
      key: "new-3",
      id: null,
      isNew: true,
      type: "",
      country: "United States",
      line1: "",
      line2: "",
      city: "",
      county: "",
      state: "",
      zip: "",
      primary: false,
      validated: false,
    })
  })

  it("reads a row back as an Address and its one-line summary", () => {
    expect(addressOfEditRow(saved({ line2: " Apt 4 " }))).toMatchObject({ addressLine2: "Apt 4", county: null, countryCode: null })
    expect(addressRowOneLine(saved({ line2: "Apt 4" }))).toBe("1 Pine St, Apt 4, SF, CA 94105")
    expect(addressRowOneLine(saved({ country: "Canada", state: "ON", zip: "M5H 1A1" }))).toBe("1 Pine St, SF, ON M5H 1A1, Canada")
    expect(addressRowOneLine(newAddressEditRow("new-1"))).toBe("")
  })

  it("a saved row changes with its type, Set as primary, Verified or a text part (trimmed); a new row always counts", () => {
    expect(isAddressRowChanged(saved({ city: " SF " }), saved())).toBe(false)
    // Story 4.3: a suggestion pick (or a manual edit) changes Verified, which Save sends.
    expect(isAddressRowChanged(saved({ validated: true }), saved({ validated: false }))).toBe(true)
    expect(isAddressRowChanged(saved({ validated: false }), saved({ validated: true }))).toBe(true)
    expect(isAddressRowChanged(saved({ type: "Main Work" }), saved())).toBe(true)
    expect(isAddressRowChanged(saved({ primary: true }), saved())).toBe(true)
    expect(isAddressRowChanged(saved({ county: "Marin" }), saved())).toBe(true)
    expect(isAddressRowChanged(saved({ city: "Oakland" }), undefined)).toBe(false)
    expect(isAddressRowChanged(added(), undefined)).toBe(true)
  })

  it("is sent when new, or saved with an id and changed", () => {
    expect(isAddressRowSent(added(), undefined)).toBe(true)
    expect(isAddressRowSent(saved({ city: "Oakland" }), saved())).toBe(true)
    expect(isAddressRowSent(saved(), saved())).toBe(false)
    expect(isAddressRowSent(saved({ id: null, city: "Oakland" }), saved({ id: null }))).toBe(false)
  })
})

describe("addressesSchema (Story 4.2)", () => {
  it("accepts the Add row and unchanged rows", () => {
    expect(issues([saved(), added()])).toEqual([])
    expect(addressesSchema.safeParse({ rows: [added()] }).success).toBe(true)
  })

  it("requires Address Type, Country, Address line 1, City and Zip on a new row", () => {
    expect(issues([newAddressEditRow("new-1")].map((row) => ({ ...row, country: " " })))).toEqual([
      ["0.type", "Choose an address type"],
      ["0.country", "Choose a country"],
      ["0.line1", "Enter address line 1"],
      ["0.city", "Enter a city"],
      ["0.zip", "Enter a ZIP code"],
    ])
  })

  it("checks a US Zip for exactly 5 digits once trimmed (the Invalid row); any other country takes any Zip", () => {
    expect(issues([added({ zip: "941" })])).toEqual([["0.zip", "Enter a 5-digit ZIP code"]])
    expect(issues([added({ zip: "94105-1234" })])).toEqual([["0.zip", "Enter a 5-digit ZIP code"]])
    expect(issues([added({ zip: " 94105 " })])).toEqual([])
    expect(issues([added({ country: "USA", zip: "9410a" })])).toEqual([["0.zip", "Enter a 5-digit ZIP code"]])
    expect(issues([added({ country: "Canada", zip: "M5H 1A1" })])).toEqual([])
  })

  it("flags a duplicate of another row (country, line 1, city, zip, type; trimmed, any case) at line 1", () => {
    expect(issues([saved(), added({ line1: " 1 PINE st ", city: "sf", zip: "94105 " })])).toEqual([["1.line1", "This address is already on your profile"]])
    // Another type is another address.
    expect(issues([saved(), added({ line1: "1 Pine St", type: "Main Work" })])).toEqual([])
    // Two new duplicates: both flagged.
    expect(issues([added(), added({ key: "new-2" })], [])).toEqual([
      ["0.line1", "This address is already on your profile"],
      ["1.line1", "This address is already on your profile"],
    ])
    // Inner spaces collapse, and every US name is one country.
    expect(issues([saved(), added({ line1: "1  Pine   St", country: "USA" })])).toEqual([["1.line1", "This address is already on your profile"]])
    expect(issues([saved({ country: "U.S.A." }), added({ line1: "1 Pine St" })], [saved({ country: "U.S.A." })])).toEqual([["1.line1", "This address is already on your profile"]])
    // A half-typed row is never a duplicate.
    expect(issues([added({ zip: "" }), added({ key: "new-2", zip: "" })], [])).toEqual([
      ["0.zip", "Enter a ZIP code"],
      ["1.zip", "Enter a ZIP code"],
    ])
  })

  it("checks a saved row only once it changes: an untouched legacy row never blocks a save", () => {
    const legacy = saved({ key: "id-5", id: 5, zip: "941", city: "" })
    expect(issues([legacy, added()], [legacy])).toEqual([])
    // A changed row still needs its required fields, but its unchanged legacy zip passes.
    expect(issues([{ ...legacy, type: "Main Work" }], [legacy])).toEqual([["0.city", "Enter a city"]])
    // Legacy duplicates of each other: neither is checked until changed.
    expect(issues([saved(), saved({ key: "id-3", id: 3 })], [saved(), saved({ key: "id-3", id: 3 })])).toEqual([])
  })

  it("checks a saved row's US zip format only once its zip or country changes (a ZIP+4 never blocks a type or primary change)", () => {
    const zipPlus4 = saved({ zip: "94105-1234" })
    expect(issues([{ ...zipPlus4, type: "Main Work" }], [zipPlus4])).toEqual([])
    expect(issues([{ ...zipPlus4, primary: true }], [zipPlus4])).toEqual([])
    expect(issues([{ ...zipPlus4, zip: "94105-12" }], [zipPlus4])).toEqual([["0.zip", "Enter a 5-digit ZIP code"]])
    const canadian = saved({ country: "Canada", zip: "M5H 1A1" })
    expect(issues([{ ...canadian, country: "United States" }], [canadian])).toEqual([["0.zip", "Enter a 5-digit ZIP code"]])
  })

  it("checks a saved row's 255 limit only on a changed field, measured trimmed", () => {
    const long = saved({ county: "x".repeat(300) })
    expect(issues([{ ...long, type: "Main Work" }], [long])).toEqual([])
    expect(issues([{ ...long, county: "y".repeat(300) }], [long])).toEqual([["0.county", "Up to 255 characters"]])
    expect(issues([added({ line1: ` ${"x".repeat(255)}  ` })])).toEqual([])
  })

  it("caps every typed field at 255 characters", () => {
    const long = "x".repeat(256)
    expect(issues([added({ line1: long, line2: long, city: long, county: long, state: long, zip: long, country: "Canada" })])).toEqual([
      ["0.line1", "Up to 255 characters"],
      ["0.line2", "Up to 255 characters"],
      ["0.city", "Up to 255 characters"],
      ["0.county", "Up to 255 characters"],
      ["0.state", "Up to 255 characters"],
      ["0.zip", "Up to 255 characters"],
    ])
    expect(issues([added({ line1: "x".repeat(255) })])).toEqual([])
  })

  it("with the countries failed, blocks a new row at its Country, never a saved one (the Countries fail row)", () => {
    expect(issues([saved({ city: "Oakland" }), added()], [saved()], true)).toEqual([["1.country", "Countries need to load before this address can be saved"]])
    expect(issues([saved({ country: "", city: "Oakland" })], [saved({ country: "" })], true)).toEqual([["0.country", "Choose a country"]])
  })
})

describe("address drafts (Story 4.2)", () => {
  it("reads draft rows, anything malformed as none", () => {
    expect(addressDraftRows([saved(), added()])).toEqual([saved(), added()])
    expect(addressDraftRows([{ key: "x" }])).toEqual([])
    expect(addressDraftRows(null)).toEqual([])
  })

  it("lists each added or changed address, named by its one-line address", () => {
    const draft = { rows: [saved({ city: "Oakland", primary: true }), added(), newAddressEditRow("new-2")] }
    const current = { rows: [saved(), saved({ key: "id-3", id: 3, county: "Marin" })] }
    expect(addressDraftDiff(draft, current)).toEqual([
      { field: "rows.id-2", label: "1 Pine St, SF, CA 94105", mine: "1 Pine St, Oakland, CA 94105 · Home · Primary", current: "1 Pine St, SF, CA 94105 · Home" },
      { field: "rows.new-1", label: "2 Elm St, SF, CA 94105", mine: "2 Elm St, SF, CA 94105 · Home · New · not saved", current: "" },
      { field: "rows.new-2", label: "New address", mine: "New · not saved", current: "" },
      { field: "rows.id-3", label: "1 Pine St, SF, CA 94105", mine: "", current: "1 Pine St, SF, CA 94105 · Marin · Home" },
    ])
    expect(addressDraftDiff(current, current)).toEqual([])
  })
})
