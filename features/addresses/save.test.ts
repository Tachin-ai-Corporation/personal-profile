import { describe, expect, it } from "vitest"
import { addressRowsToSend, mergeAddressRows } from "./save"
import { newAddressEditRow, type AddressEditRow } from "./schema"

/** Story 4.2 (NG-9026): the send order and the rows rebuilt after a failed step. */

const saved = (id: number, overrides: Partial<AddressEditRow> = {}): AddressEditRow => ({
  key: `id-${id}`,
  id,
  isNew: false,
  type: "Home",
  country: "United States",
  line1: `${id} Pine St`,
  line2: "",
  city: "SF",
  county: "",
  state: "CA",
  zip: "94105",
  primary: false,
  validated: false,
  ...overrides,
})

const added = (key: string, overrides: Partial<AddressEditRow> = {}): AddressEditRow => ({ ...newAddressEditRow(key), type: "Home", line1: "9 Elm St", city: "SF", zip: "94105", ...overrides })

describe("addressRowsToSend", () => {
  it("sends new rows and changed saved rows, unchanged ones never (the Unchanged row)", () => {
    const before = [saved(1, { primary: true }), saved(2)]
    expect(addressRowsToSend(before, before)).toEqual([])
    expect(addressRowsToSend([saved(1, { primary: true }), saved(2, { city: "Oakland" }), added("new-1")], before).map((row) => row.key)).toEqual(["id-2", "new-1"])
  })

  it("sends the newly checked Set as primary first, then table order", () => {
    const before = [saved(1, { primary: true }), saved(2), saved(3)]
    expect(addressRowsToSend([saved(1, { primary: true, city: "Oakland" }), saved(2, { city: "LA" }), saved(3, { primary: true })], before).map((row) => row.key)).toEqual([
      "id-3",
      "id-1",
      "id-2",
    ])
    expect(addressRowsToSend([...before, added("new-1"), added("new-2", { primary: true })], before).map((row) => row.key)).toEqual(["new-2", "new-1"])
  })

  it("never sends a saved row without an id", () => {
    const orphan = saved(4, { key: "none-0", id: null })
    expect(addressRowsToSend([{ ...orphan, city: "LA" }], [orphan])).toEqual([])
  })
})

describe("mergeAddressRows", () => {
  it("a succeeded PUT becomes its fresh row; an unsent new row stays as typed (the Two steps row)", () => {
    const before = [saved(2, { validated: true })]
    const rows = [saved(2, { city: "Oakland", validated: true }), added("new-1")]
    const fresh = [saved(2, { city: "Oakland" })]
    expect(mergeAddressRows({ rows, before, fresh, succeeded: new Set(["id-2"]), created: new Map() })).toEqual([saved(2, { city: "Oakland" }), added("new-1")])
  })

  it("a created row becomes its fresh row by id (or a saved row when the refetch lacks it); an unknown id comes back from the refetch", () => {
    const rows = [added("new-1"), added("new-2"), added("new-3")]
    const fresh = [saved(31, { primary: true }), saved(40)]
    expect(
      mergeAddressRows({
        rows,
        before: [],
        fresh,
        succeeded: new Set(["new-1", "new-2", "new-3"]),
        created: new Map<string, number | null>([
          ["new-1", 31],
          ["new-2", 32],
          ["new-3", null],
        ]),
      }),
    ).toEqual([saved(31, { primary: true }), { ...added("new-2"), key: "id-32", id: 32, isNew: false }, saved(40)])
  })

  it("an unsent saved row keeps only the fields the user changed; the rest come fresh (the old Primary demoted)", () => {
    const before = [saved(1, { primary: true }), saved(2), saved(3)]
    const rows = [saved(1, { primary: true, city: "Oakland" }), saved(2, { primary: true }), saved(3)]
    // Row 2 became Primary (succeeded); the backend demoted row 1; row 1's own PUT failed; row 3 was updated elsewhere.
    const fresh = [saved(1, { validated: true }), saved(2, { primary: true }), saved(3, { county: "Marin" })]
    expect(mergeAddressRows({ rows, before, fresh, succeeded: new Set(["id-2"]), created: new Map() })).toEqual([
      saved(1, { primary: false, city: "Oakland", validated: true }),
      saved(2, { primary: true }),
      saved(3, { county: "Marin" }),
    ])
  })

  it("an unsent saved row keeps the Verified the user's pick or edit set (Story 4.3)", () => {
    const before = [saved(1), saved(2, { validated: true })]
    // Row 1 was picked from a suggestion (Verified), row 2 edited by hand (Verified cleared); neither was sent.
    const rows = [saved(1, { line1: "1 Pine Street", validated: true }), saved(2, { city: "Oakland" })]
    const fresh = [saved(1, { county: "Marin" }), saved(2, { validated: true })]
    expect(mergeAddressRows({ rows, before, fresh, succeeded: new Set(), created: new Map() })).toEqual([
      saved(1, { line1: "1 Pine Street", county: "Marin", validated: true }),
      saved(2, { city: "Oakland", validated: false }),
    ])
  })

  it("keeps a saved row the refetch no longer has, and a whitespace-only edit counts as unchanged", () => {
    const before = [saved(1), saved(2)]
    const rows = [saved(1, { city: "Oakland" }), saved(2, { city: " SF " })]
    const fresh = [saved(2, { state: "NV" })]
    expect(mergeAddressRows({ rows, before, fresh, succeeded: new Set(), created: new Map() })).toEqual([saved(1, { city: "Oakland" }), saved(2, { state: "NV" })])
    // A row with no saved values to compare is taken fresh.
    expect(mergeAddressRows({ rows: [saved(2, { city: "LA" })], before: [], fresh, succeeded: new Set(), created: new Map() })).toEqual([saved(2, { state: "NV" })])
  })
})
