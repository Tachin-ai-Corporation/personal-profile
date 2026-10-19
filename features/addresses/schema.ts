import { z } from "zod"
import type { DraftDiffRow, DraftValues } from "@/features/shell"
import { ADDRESS_FIELD_MAX_LENGTH, DEFAULT_ADDRESS_COUNTRY, type Address } from "@/lib/api"
import { ADDRESS_MESSAGES, COMMON_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { formatAddressOneLine, isUnitedStatesName } from "./format"

/**
 * The Addresses edit view's form values and rules (Story 4.2, FR26,
 * NG-9026). Every message is catalog copy (`ADDRESS_MESSAGES`). The form
 * holds one list, `rows`: the saved addresses and the new ones, each with
 * every field as a string (`""` when empty). The rows carry no expanded
 * state: the Section keeps that by row key.
 */

const addressEditRowSchema = z.object({
  /** A stable row key: the read view's for a saved row, `new-<n>` for a new one. */
  key: z.string(),
  /** The saved row's id; `null` for a new row (and for a saved row the API sent without one, or a repeated id). */
  id: z.number().nullable(),
  isNew: z.boolean(),
  /** The Address Type (`""` while none is picked). */
  type: z.string(),
  country: z.string(),
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  county: z.string(),
  state: z.string(),
  zip: z.string(),
  /** "Set as primary": sent as `primary` (Story 4.4 adds exclusivity). */
  primary: z.boolean(),
  /** The saved row's `validated` (a new row's is `false`). */
  validated: z.boolean(),
})

export type AddressEditRow = z.infer<typeof addressEditRowSchema>

export interface AddressValues {
  rows: AddressEditRow[]
}

/** The text fields a row compares and trims. */
const TEXT_FIELDS = ["country", "line1", "line2", "city", "county", "state", "zip"] as const

/** The fields the user types (the 255-character limit). */
const TYPED_FIELDS = ["line1", "line2", "city", "county", "state", "zip"] as const

/** A saved address as an edit row: its parts as read (absent ones `""`). */
export function addressEditRowOf(key: string, address: Address): AddressEditRow {
  return {
    key,
    id: address.id,
    isNew: false,
    type: address.type ?? "",
    country: address.country ?? "",
    line1: address.addressLine1 ?? "",
    line2: address.addressLine2 ?? "",
    city: address.cityName ?? "",
    county: address.county ?? "",
    state: address.stateName ?? "",
    zip: address.postalCode ?? "",
    primary: address.primary,
    validated: address.validated,
  }
}

/** An empty new row keyed `key`: no type, the United States, not Primary, not validated. */
export function newAddressEditRow(key: string): AddressEditRow {
  return {
    key,
    id: null,
    isNew: true,
    type: "",
    country: DEFAULT_ADDRESS_COUNTRY,
    line1: "",
    line2: "",
    city: "",
    county: "",
    state: "",
    zip: "",
    primary: false,
    validated: false,
  }
}

/** An edit row as an `Address` (its one-line summary; empty parts are absent). */
export function addressOfEditRow(row: AddressEditRow): Address {
  const part = (value: string): string | null => value.trim() || null
  return {
    id: row.id,
    type: part(row.type),
    addressLine1: part(row.line1),
    addressLine2: part(row.line2),
    cityName: part(row.city),
    county: part(row.county),
    stateName: part(row.state),
    postalCode: part(row.zip),
    country: part(row.country),
    countryCode: null,
    primary: row.primary,
    validated: row.validated,
  }
}

/** The row's one-line address (`formatAddressOneLine`), `""` when nothing is filled. */
export const addressRowOneLine = (row: AddressEditRow): string => formatAddressOneLine(addressOfEditRow(row))

/**
 * `true` when a saved row differs from its saved values: the type, the
 * "Set as primary" box or a text part (compared trimmed). A new row always
 * counts; a saved row with nothing saved to compare never does.
 */
export function isAddressRowChanged(row: AddressEditRow, saved: AddressEditRow | undefined): boolean {
  if (row.isNew) return true
  if (!saved) return false
  return row.type !== saved.type || row.primary !== saved.primary || TEXT_FIELDS.some((field) => row[field].trim() !== saved[field].trim())
}

/** `true` when Save sends the row: a new row (POST), or a changed saved row with an id (PUT). */
export function isAddressRowSent(row: AddressEditRow, saved: AddressEditRow | undefined): boolean {
  return row.isNew || (row.id !== null && isAddressRowChanged(row, saved))
}

/** The duplicate check's key: country + line 1 + city + zip + type, trimmed, inner spaces collapsed, case-insensitive; every US name is one country. */
const duplicateKey = (row: AddressEditRow): string =>
  [isUnitedStatesName(row.country) ? "united states" : row.country, row.line1, row.city, row.zip, row.type]
    .map((part) => part.trim().replace(/\s+/g, " ").toLowerCase())
    .join("\u0000")

/** `true` when every part of the duplicate key is filled (a half-typed row is never a duplicate). */
const hasDuplicateKey = (row: AddressEditRow): boolean => [row.country, row.line1, row.city, row.zip, row.type].every((part) => part.trim() !== "")

export interface AddressesSchemaContext {
  /** The saved rows (the edit's baseline): only a new or changed row is checked, so an untouched legacy row never blocks a save. */
  readonly saved: readonly AddressEditRow[]
  /** The countries list failed to load: a new row can't be saved (its country can't be confirmed). */
  readonly countriesFailed: boolean
}

/**
 * The rules of Story 4.2, checked on blur and on Save (nothing is sent while
 * one fails), each at its row's field, for every row Save would send:
 *
 * - required: Address Type, Country, Address line 1, City and Zip;
 * - a United States Zip must be exactly 5 digits once trimmed: "Enter a
 *   5-digit ZIP code" (on a saved row only once its zip or country changed);
 * - a typed field over 255 characters once trimmed (the proxy's limit; on a
 *   saved row only once that field changed);
 * - country + line 1 + city + zip + type equal (trimmed, case-insensitive)
 *   to another row in the Section: "This address is already on your
 *   profile", at line 1;
 * - with the countries list failed, a new row: at its Country.
 */
export function addressesSchemaWith({ saved, countriesFailed }: AddressesSchemaContext) {
  const savedByKey = new Map(saved.map((row) => [row.key, row]))
  return z.object({
    rows: z.array(addressEditRowSchema).superRefine((rows, context) => {
      const keys = rows.map((row) => (hasDuplicateKey(row) ? duplicateKey(row) : null))
      rows.forEach((row, index) => {
        const before = savedByKey.get(row.key)
        if (!isAddressRowSent(row, before)) return
        /** A new row's field, or a saved row's field that differs from its saved value: only then the format rules apply (a legacy value never blocks an unrelated edit). */
        const changed = (field: (typeof TEXT_FIELDS)[number]): boolean => row.isNew || !before || row[field].trim() !== before[field].trim()
        const issue = (field: keyof AddressEditRow, message: string) => context.addIssue({ code: "custom", path: [index, field], message })
        if (row.type.trim() === "") issue("type", ADDRESS_MESSAGES.chooseType)
        if (row.country.trim() === "") issue("country", ADDRESS_MESSAGES.chooseCountry)
        else if (countriesFailed && row.isNew) issue("country", ADDRESS_MESSAGES.countriesNeeded)
        const tooLong = new Set(TYPED_FIELDS.filter((field) => changed(field) && row[field].trim().length > ADDRESS_FIELD_MAX_LENGTH))
        for (const field of tooLong) issue(field, ADDRESS_MESSAGES.textTooLong)
        if (row.line1.trim() === "") issue("line1", ADDRESS_MESSAGES.line1Required)
        else if (!tooLong.has("line1") && keys[index] !== null && keys.some((key, other) => other !== index && key === keys[index])) {
          issue("line1", ADDRESS_MESSAGES.duplicateAddress)
        }
        if (row.city.trim() === "") issue("city", ADDRESS_MESSAGES.cityRequired)
        if (row.zip.trim() === "") issue("zip", ADDRESS_MESSAGES.zipRequired)
        // The zip format is checked again when the country changes (e.g. to the United States).
        else if (!tooLong.has("zip") && (changed("zip") || changed("country")) && isUnitedStatesName(row.country) && !/^\d{5}$/.test(row.zip.trim())) {
          issue("zip", ADDRESS_MESSAGES.zipFiveDigits)
        }
      })
    }),
  }) satisfies z.ZodType<AddressValues, AddressValues>
}

/** The rules with nothing saved and the countries loaded (every row is new to them). */
export const addressesSchema = addressesSchemaWith({ saved: [], countriesFailed: false })

/** The rows a draft holds (a stored draft is JSON: anything malformed reads as none). */
export function addressDraftRows(value: unknown): AddressEditRow[] {
  const parsed = z.array(addressEditRowSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** One row as the draft compare reads it: the one-line address · county · type · Primary · its edit state. */
function describeRow(row: AddressEditRow | undefined): string {
  if (!row) return ""
  return [addressRowOneLine(row), row.county.trim(), row.type, row.primary ? COMMON_MESSAGES.primary : "", row.isNew ? SECTION_MESSAGES.newNotSaved : ""]
    .filter((part) => part !== "")
    .join(" · ")
}

/**
 * The draft conflict compare rows (F4): one per address whose stored row
 * differs from the current one (added, edited, its "Set as primary"
 * changed), named by its one-line address ("New address" while empty).
 */
export function addressDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  const mine = addressDraftRows(draft.rows)
  const now = addressDraftRows(current.rows)
  const keys = [...new Set([...mine.map((row) => row.key), ...now.map((row) => row.key)])]
  return keys.flatMap((key) => {
    const a = mine.find((row) => row.key === key)
    const b = now.find((row) => row.key === key)
    const left = describeRow(a)
    const right = describeRow(b)
    if (left === right) return []
    const named = (b ?? a) as AddressEditRow
    return [{ field: `rows.${key}`, label: addressRowOneLine(named) || ADDRESS_MESSAGES.newAddress, mine: left, current: right }]
  })
}
