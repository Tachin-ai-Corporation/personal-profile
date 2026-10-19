import { z } from "zod"
import type { DraftDiffRow, DraftValues } from "@/features/shell"
import { PRIMARY_LABEL, type ContactPoint } from "@/lib/api"
import { CONTACT_LABELS, CONTACT_PHONE_TYPES, type ContactPhoneType } from "@/lib/shared/contact-labels"
import { CONTACT_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { dialCodeOf, EMPTY_PHONE_INPUT, formatPhoneDisplay, phoneInputFrom, phoneIssue, toE164, type PhoneInputValue } from "@/lib/shared/phone"

/**
 * The Phone edit view's form values and rules (Story 3.2, FR16, NG-9023).
 * Every message is catalog copy (`CONTACT_MESSAGES`, `SECTION_MESSAGES`).
 * The form holds one list, `rows`: the saved numbers (locked value and type,
 * an editable label, struck through by Remove) and the new ones (a phone
 * input, a label and a type).
 */

/** The most phones of one Contact Type a person can have (backend `MAX_CONTACT_POINTS_PER_TYPE`). */
export const PHONE_TYPE_LIMIT = 20

const phoneEditRowSchema = z.object({
  /** A stable row key: the read view's for a saved row, `new-<n>` for a new one. */
  key: z.string(),
  /** The saved row's id; `null` for a new row (and for a saved row the API sent without one). */
  id: z.number().nullable(),
  isNew: z.boolean(),
  /** `Mobile` or `Landline`; `""` while a new row has none. */
  type: z.string(),
  /** The Contact Label; `""` while a new row has none (or a saved row has none). */
  label: z.string(),
  /** A saved row's number as read (`""` for a new row). */
  value: z.string(),
  /** A saved row's `phoneNumberRegion` as read (`""` without one). */
  region: z.string(),
  /** A new row's phone input (unused on a saved row). */
  phone: z.object({ region: z.string(), national: z.string() }),
  /** A saved row struck through by Remove (a new row is deleted instead). */
  removed: z.boolean(),
  /**
   * Its `isNotificationEnabled` (Story 3.4: only the Primary row's switch
   * changes it; a new row's is off). Absent in a draft stored before Story
   * 3.4, which reads as unchanged.
   */
  notifications: z.boolean().optional(),
})

export type PhoneEditRow = z.infer<typeof phoneEditRowSchema>

export interface PhoneValues {
  rows: PhoneEditRow[]
}

/** The labels a user may pick for a phone: never Primary (Story 3.4's Make primary sets it). */
const PICKABLE_LABELS: ReadonlySet<string> = new Set(CONTACT_LABELS.filter((label) => label !== PRIMARY_LABEL))

const isPhoneType = (type: string): type is ContactPhoneType => (CONTACT_PHONE_TYPES as readonly string[]).includes(type)

/** The row's number as E.164, for the duplicate check: a new row's input, or a saved row's value (raw when it doesn't parse). */
export function phoneRowE164(row: PhoneEditRow): string | null {
  if (row.isNew) return toE164(row.phone)
  return toE164(phoneInputFrom(row.value, row.region)) ?? row.value
}

/** The rows that count toward a type's limit: saved rows not struck through, and new rows. */
const counts = (row: PhoneEditRow): boolean => row.isNew || !row.removed

/** How many phones of `type` the rows hold (saved not removed + new), leaving out the row keyed `exceptKey`. */
export function phoneTypeCount(rows: readonly PhoneEditRow[], type: ContactPhoneType, exceptKey?: string): number {
  return rows.filter((row) => row.key !== exceptKey && row.type === type && counts(row)).length
}

/** `true` when `type` holds its 20 phones without the row keyed `exceptKey` (so that row can't take it). */
export function isPhoneTypeFull(rows: readonly PhoneEditRow[], type: ContactPhoneType, exceptKey?: string): boolean {
  return phoneTypeCount(rows, type, exceptKey) >= PHONE_TYPE_LIMIT
}

/** `true` when both Mobile and Landline hold 20 phones: no phone can be added. */
export function arePhoneTypesFull(rows: readonly PhoneEditRow[]): boolean {
  return CONTACT_PHONE_TYPES.every((type) => isPhoneTypeFull(rows, type))
}

/** The message for a new number's `phoneIssue`; an empty one reads like a short one for its region. */
function numberMessage(phone: PhoneInputValue): string | undefined {
  const issue = phoneIssue(phone)
  if (issue === null) return undefined
  if (issue === "required") return dialCodeOf(phone.region) === "1" ? CONTACT_MESSAGES.phoneTenDigits : SECTION_MESSAGES.phoneInvalid
  return issue === "tenDigits" ? CONTACT_MESSAGES.phoneTenDigits : SECTION_MESSAGES.phoneInvalid
}

/**
 * The rules of Story 3.2, checked on blur and Save (nothing is sent while
 * one fails), each at its row's field:
 *
 * - a new number: a +1 region needs 10 digits ("Enter a 10-digit US
 *   number"), any other a valid number ("Enter a valid phone number"); an
 *   empty one reads the same;
 * - a new number whose E.164 form equals any other row's (saved, struck
 *   through or new): "This number is already on your profile";
 * - a new row's empty (or unknown) Label: "Choose a label"; its empty Type:
 *   "Choose Mobile or Landline";
 * - a new row whose Type is past its limit of 20 (saved rows not struck
 *   through count first, then the new rows in order): "You've reached the
 *   limit of 20 phones".
 *
 * Saved rows are never invalid: their number and type are locked, and an
 * unchanged label is never sent.
 */
export const phoneSchema = z.object({
  rows: z.array(phoneEditRowSchema).superRefine((rows, context) => {
    const numbers = rows.map(phoneRowE164)
    const seen: Record<ContactPhoneType, number> = { Mobile: 0, Landline: 0 }
    for (const type of CONTACT_PHONE_TYPES) seen[type] = rows.filter((row) => !row.isNew && row.type === type && counts(row)).length
    rows.forEach((row, index) => {
      if (!row.isNew) return
      const issue = (field: "phone" | "label" | "type", message: string) => context.addIssue({ code: "custom", path: [index, field], message })
      const numberIssue = numberMessage(row.phone)
      if (numberIssue !== undefined) issue("phone", numberIssue)
      else if (numbers.some((number, other) => other !== index && number === numbers[index])) issue("phone", CONTACT_MESSAGES.duplicatePhone)
      if (!PICKABLE_LABELS.has(row.label)) issue("label", CONTACT_MESSAGES.chooseLabel)
      if (!isPhoneType(row.type)) {
        issue("type", CONTACT_MESSAGES.choosePhoneType)
        return
      }
      seen[row.type] += 1
      if (seen[row.type] > PHONE_TYPE_LIMIT) issue("type", CONTACT_MESSAGES.phoneLimit)
    })
  }),
}) satisfies z.ZodType<PhoneValues, PhoneValues>

/** A saved phone as an edit row (`type` from the list it was read from). */
export function phoneEditRowOf(key: string, type: ContactPhoneType, point: ContactPoint): PhoneEditRow {
  return {
    key,
    id: point.id,
    isNew: false,
    type,
    label: point.label ?? "",
    value: point.value ?? "",
    region: point.phoneNumberRegion ?? "",
    phone: { ...EMPTY_PHONE_INPUT },
    removed: false,
    notifications: point.isNotificationEnabled === true,
  }
}

/** An empty new row keyed `key`: the default region, no label, no type. */
export function newPhoneEditRow(key: string): PhoneEditRow {
  return { key, id: null, isNew: true, type: "", label: "", value: "", region: "", phone: { ...EMPTY_PHONE_INPUT }, removed: false, notifications: false }
}

/** The Type copy of a row (`""` without one). */
export function phoneTypeLabel(type: string): string {
  if (type === "Mobile") return CONTACT_MESSAGES.phoneTypeMobile
  if (type === "Landline") return CONTACT_MESSAGES.phoneTypeLandline
  return ""
}

/** A row's number as shown: a saved one formatted for its region, a new one as typed (formatted once it is valid). */
export function phoneRowNumber(row: PhoneEditRow): string {
  if (!row.isNew) return formatPhoneDisplay(row.value, row.region)
  const e164 = toE164(row.phone)
  return e164 === null ? row.phone.national.trim() : formatPhoneDisplay(e164, row.phone.region)
}

/** The rows a draft holds (a stored draft is JSON: anything malformed reads as none). */
export function phoneDraftRows(value: unknown): PhoneEditRow[] {
  const parsed = z.array(phoneEditRowSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** A Primary row's notifications as the draft compare reads them (only the Primary has the switch); "" for any other row. */
function describeNotifications(row: PhoneEditRow): string {
  if (row.isNew || row.label !== PRIMARY_LABEL || row.notifications === undefined) return ""
  return row.notifications ? CONTACT_MESSAGES.notificationsDraftOn : CONTACT_MESSAGES.notificationsDraftOff
}

/** One row as the draft compare reads it: label · type · the Primary's notifications · its edit state. */
function describeRow(row: PhoneEditRow | undefined): string {
  if (!row) return ""
  const state = row.removed ? SECTION_MESSAGES.removedOnSave : row.isNew ? SECTION_MESSAGES.newNotSaved : ""
  return [row.label, phoneTypeLabel(row.type), describeNotifications(row), state].filter((part) => part !== "").join(" · ")
}

/**
 * The draft conflict compare rows (F4): one per phone whose stored row
 * differs from the current one (added, struck through, relabelled, the
 * Primary's notifications switched), named
 * by its number.
 */
export function phoneDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  const mine = phoneDraftRows(draft.rows)
  const now = phoneDraftRows(current.rows)
  const keys = [...new Set([...mine.map((row) => row.key), ...now.map((row) => row.key)])]
  return keys.flatMap((key) => {
    const stored = mine.find((row) => row.key === key)
    const b = now.find((row) => row.key === key)
    // A draft row stored before Story 3.4 holds no notifications: read as the current ones (unchanged).
    const a = stored && stored.notifications === undefined && b ? { ...stored, notifications: b.notifications } : stored
    const left = describeRow(a)
    const right = describeRow(b)
    if (left === right) return []
    return [{ field: `rows.${key}`, label: phoneRowNumber((a ?? b) as PhoneEditRow), mine: left, current: right }]
  })
}
