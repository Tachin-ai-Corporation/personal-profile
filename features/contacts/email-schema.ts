import { z } from "zod"
import type { DraftDiffRow, DraftValues } from "@/features/shell"
import { PRIMARY_LABEL, type ContactPoint } from "@/lib/api"
import { CONTACT_LABELS } from "@/lib/shared/contact-labels"
import { suggestEmailCorrection } from "@/lib/shared/email-typo"
import { CONTACT_MESSAGES, formatMessage, SECTION_MESSAGES } from "@/lib/shared/messages"

/**
 * The Email edit view's form values and rules (Stories 3.5–3.6, FR20–FR23, NG-9024).
 * Every message is catalog copy (`CONTACT_MESSAGES`, `SECTION_MESSAGES`).
 * The form holds one list, `rows`: the saved addresses (a locked value, an
 * editable label, struck through by Remove; the Primary's notifications) and
 * the new ones (an address and a label).
 */

/** The most emails a person can have (backend `MAX_CONTACT_POINTS_PER_TYPE`). */
export const EMAIL_LIMIT = 20

/** The longest address accepted here: a client-side rule from RFC 5321's 254-character path limit. */
export const EMAIL_MAX_LENGTH = 254

const emailEditRowSchema = z.object({
  /** A stable row key: the read view's for a saved row, `new-<n>` for a new one. */
  key: z.string(),
  /** The saved row's id; `null` for a new row (and for a saved row the API sent without one, or a repeated id). */
  id: z.number().nullable(),
  isNew: z.boolean(),
  /** The Contact Label; `""` while a new row has none (or a saved row has none). */
  label: z.string(),
  /** A saved row's address as read, or a new row's address as typed (sent trimmed). */
  value: z.string(),
  /** A saved row struck through by Remove (a new row is deleted instead). */
  removed: z.boolean(),
  /**
   * Its `isNotificationEnabled` (Story 3.6: only the Primary row's switch
   * changes it; a new row's is off). Absent in a draft stored before Story
   * 3.6, which reads as unchanged.
   */
  notifications: z.boolean().optional(),
})

export type EmailEditRow = z.infer<typeof emailEditRowSchema>

export interface EmailValues {
  rows: EmailEditRow[]
}

/** The labels a user may pick for an email: never Primary (Story 3.6's Make primary sets it). */
const PICKABLE_LABELS: ReadonlySet<string> = new Set(CONTACT_LABELS.filter((label) => label !== PRIMARY_LABEL))

const ADDRESS = z.email().max(EMAIL_MAX_LENGTH)

/** `true` when the trimmed `value` is an address the backend takes (zod's email, at most 254 characters). */
export function isEmailAddress(value: string): boolean {
  return ADDRESS.safeParse(value.trim()).success
}

/** The address as the duplicate check compares it: trimmed, case-insensitive. */
const comparable = (row: EmailEditRow): string => row.value.trim().toLowerCase()

/** The rows that count toward the limit: saved rows not struck through, and new rows. */
const counts = (row: EmailEditRow): boolean => row.isNew || !row.removed

/** How many emails the rows hold (saved not removed + new). */
export function emailCount(rows: readonly EmailEditRow[]): number {
  return rows.filter(counts).length
}

/** `true` when the rows hold 20 emails: no email can be added. */
export function isEmailFull(rows: readonly EmailEditRow[]): boolean {
  return emailCount(rows) >= EMAIL_LIMIT
}

/**
 * The rules of Story 3.5, checked on blur and Save (nothing is sent while
 * one fails), each at its row's field:
 *
 * - a new address whose trimmed value isn't an email (zod) or is over 254
 *   characters, an empty one too: "Enter a valid email address";
 * - a new address whose domain is a likely typo of a well-known provider
 *   (`suggestEmailCorrection`, e.g. `test@gmail.cnn`): "Did you mean
 *   test@gmail.com?";
 * - a new address equal (trimmed, case-insensitive) to any other row's
 *   (saved, struck through or new): "This email is already on your profile";
 * - a new row's empty (or unpickable) Label: "Choose a label";
 * - a new row past the limit of 20 (saved rows not struck through count
 *   first, then the new rows in order): "You've reached the limit of 20
 *   emails", at its address.
 *
 * Saved rows are never invalid: their address is locked, and an unchanged
 * label is never sent.
 */
export const emailSchema = z.object({
  rows: z.array(emailEditRowSchema).superRefine((rows, context) => {
    const addresses = rows.map(comparable)
    let seen = rows.filter((row) => !row.isNew && counts(row)).length
    rows.forEach((row, index) => {
      if (!row.isNew) return
      const issue = (field: "value" | "label", message: string) => context.addIssue({ code: "custom", path: [index, field], message })
      seen += 1
      const suggestion = suggestEmailCorrection(row.value)
      if (!isEmailAddress(row.value)) issue("value", CONTACT_MESSAGES.emailInvalid)
      else if (suggestion !== null) issue("value", formatMessage(CONTACT_MESSAGES.emailTypo, { suggestion }))
      else if (addresses.some((address, other) => other !== index && address === addresses[index])) issue("value", CONTACT_MESSAGES.duplicateEmail)
      else if (seen > EMAIL_LIMIT) issue("value", CONTACT_MESSAGES.emailLimit)
      if (!PICKABLE_LABELS.has(row.label)) issue("label", CONTACT_MESSAGES.chooseLabel)
    })
  }),
}) satisfies z.ZodType<EmailValues, EmailValues>

/** A saved email as an edit row. */
export function emailEditRowOf(key: string, point: ContactPoint): EmailEditRow {
  return { key, id: point.id, isNew: false, label: point.label ?? "", value: point.value ?? "", removed: false, notifications: point.isNotificationEnabled === true }
}

/** An empty new row keyed `key`: no address, no label. */
export function newEmailEditRow(key: string): EmailEditRow {
  return { key, id: null, isNew: true, label: "", value: "", removed: false, notifications: false }
}

/** The rows a draft holds (a stored draft is JSON: anything malformed reads as none). */
export function emailDraftRows(value: unknown): EmailEditRow[] {
  const parsed = z.array(emailEditRowSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** A Primary row's notifications as the draft compare reads them (only the Primary has the switch); "" for any other row. */
function describeNotifications(row: EmailEditRow): string {
  if (row.isNew || row.label !== PRIMARY_LABEL || row.notifications === undefined) return ""
  return row.notifications ? CONTACT_MESSAGES.notificationsDraftOn : CONTACT_MESSAGES.notificationsDraftOff
}

/** One row as the draft compare reads it: label · the Primary's notifications · its edit state. */
function describeRow(row: EmailEditRow | undefined): string {
  if (!row) return ""
  const state = row.removed ? SECTION_MESSAGES.removedOnSave : row.isNew ? SECTION_MESSAGES.newNotSaved : ""
  return [row.label, describeNotifications(row), state].filter((part) => part !== "").join(" · ")
}

/**
 * The draft conflict compare rows (F4): one per email whose stored row
 * differs from the current one (added, struck through, relabelled, the
 * Primary's notifications switched), named by its address.
 */
export function emailDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  const mine = emailDraftRows(draft.rows)
  const now = emailDraftRows(current.rows)
  const keys = [...new Set([...mine.map((row) => row.key), ...now.map((row) => row.key)])]
  return keys.flatMap((key) => {
    const stored = mine.find((row) => row.key === key)
    const b = now.find((row) => row.key === key)
    // A draft row stored before Story 3.6 holds no notifications: read as the current ones (unchanged).
    const a = stored && stored.notifications === undefined && b ? { ...stored, notifications: b.notifications } : stored
    const left = describeRow(a)
    const right = describeRow(b)
    if (left === right) return []
    return [{ field: `rows.${key}`, label: ((a ?? b) as EmailEditRow).value.trim(), mine: left, current: right }]
  })
}
