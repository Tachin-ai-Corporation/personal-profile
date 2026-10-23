import { z } from "zod"
import type { DraftDiffRow, DraftValues } from "@/features/shell"
import { PRIMARY_LABEL, type ContactPoint } from "@/lib/api"
import { CONTACT_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"

/**
 * The Social media edit view's form values and rules (Story 3.7, FR24, NG-9025).
 * Every message is catalog copy (`CONTACT_MESSAGES`, `SECTION_MESSAGES`).
 * The form holds one list, `rows`: the saved links (an editable value,
 * struck through by Remove; a legacy Primary, a row without an id and a
 * repeated id are locked) and the new ones (a value). There are no labels,
 * statuses or notifications here.
 */

/** The most links a person can have (backend `MAX_CONTACT_POINTS_PER_TYPE`). */
export const SOCIAL_LIMIT = 20

/** The longest link the proxy's manage body takes (`allowlist/contacts.ts`, value ≤ 2048): the input's `maxLength`. */
export const SOCIAL_LINK_MAX_LENGTH = 2048

const socialEditRowSchema = z.object({
  /** A stable row key: the read view's for a saved row, `new-<n>` for a new one. */
  key: z.string(),
  /** The saved row's id; `null` for a new row (and for a saved row the API sent without one, or a repeated id). */
  id: z.number().nullable(),
  isNew: z.boolean(),
  /** The saved Contact Label, never edited here (a legacy Primary is locked); `""` for a new row. */
  label: z.string(),
  /** The link as typed (sent trimmed). */
  value: z.string(),
  /** The saved link as read (`""` for a new row): a saved row is checked and sent only once its value differs. */
  savedValue: z.string(),
  /** A saved row struck through by Remove (a new row is deleted instead). */
  removed: z.boolean(),
})

export type SocialEditRow = z.infer<typeof socialEditRowSchema>

export interface SocialValues {
  rows: SocialEditRow[]
}

/**
 * `true` when the trimmed `value` is a link the backend takes: it starts with
 * lower-case `http://` or `https://` (the backend's `Helper.validateURL` is
 * case-sensitive), parses as a URL, holds no whitespace, and its host has a
 * dot whose last label is two or more letters. A link without its scheme
 * (`www.x.com/ann`), a handle (`@name`) and `javascript:` fail, and so does a
 * link with credentials (`https://x.com@evil.example` reads like x.com but
 * opens evil.example).
 */
export function isSocialLink(value: string): boolean {
  const trimmed = value.trim()
  if (!/^https?:\/\//.test(trimmed) || /\s/.test(trimmed)) return false
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  if (url.username !== "" || url.password !== "") return false
  const labels = url.hostname.split(".")
  return labels.length > 1 && /^[a-z]{2,}$/i.test(labels[labels.length - 1])
}

/** A saved row the edit view can't change or remove: a legacy Primary, a row without an id or a repeated id (both `id: null`). */
export function isSocialRowLocked(row: SocialEditRow): boolean {
  return !row.isNew && (row.id === null || row.label === PRIMARY_LABEL)
}

/** A row whose link is sent: a new row, or a saved editable row not struck through whose trimmed value differs from the saved one. */
export function isSocialRowChanged(row: SocialEditRow): boolean {
  if (row.isNew) return true
  return !isSocialRowLocked(row) && !row.removed && row.value.trim() !== row.savedValue.trim()
}

/** The link as the duplicate check compares it: trimmed, case-insensitive; a struck-through saved row by its saved link (its edit is never sent). */
const comparable = (row: SocialEditRow): string => (!row.isNew && row.removed ? row.savedValue : row.value).trim().toLowerCase()

/** The rows that count toward the limit: saved rows not struck through, and new rows. */
const counts = (row: SocialEditRow): boolean => row.isNew || !row.removed

/** How many links the rows hold (saved not removed + new). */
export function socialCount(rows: readonly SocialEditRow[]): number {
  return rows.filter(counts).length
}

/** `true` when the rows hold 20 links: no link can be added. */
export function isSocialFull(rows: readonly SocialEditRow[]): boolean {
  return socialCount(rows) >= SOCIAL_LIMIT
}

/**
 * The rules of Story 3.7, checked on blur and Save (nothing is sent while
 * one fails), at the row's link, on every new row and every saved row whose
 * link changed (an unchanged saved link is never sent, so a legacy value
 * such as a handle never blocks a save):
 *
 * - an empty link (trimmed): "Enter a link";
 * - not an http or https link (`isSocialLink`): "Enter a link that starts with http:// or https://";
 * - equal (trimmed, case-insensitive) to any other row's (saved, struck
 *   through or new): "This link is already on your profile";
 * - a new row past the limit of 20 (saved rows not struck through count
 *   first, then the new rows in order): "You've reached the limit of 20 links".
 */
export const socialSchema = z.object({
  rows: z.array(socialEditRowSchema).superRefine((rows, context) => {
    const links = rows.map(comparable)
    let seen = rows.filter((row) => !row.isNew && counts(row)).length
    rows.forEach((row, index) => {
      if (row.isNew) seen += 1
      if (!isSocialRowChanged(row)) return
      const issue = (message: string) => context.addIssue({ code: "custom", path: [index, "value"], message })
      if (links[index] === "") issue(CONTACT_MESSAGES.socialRequired)
      else if (!isSocialLink(row.value)) issue(CONTACT_MESSAGES.socialInvalid)
      else if (links.some((link, other) => other !== index && link === links[index])) issue(CONTACT_MESSAGES.duplicateSocial)
      else if (row.isNew && seen > SOCIAL_LIMIT) issue(CONTACT_MESSAGES.socialLimit)
    })
  }),
}) satisfies z.ZodType<SocialValues, SocialValues>

/** A saved link as an edit row. */
export function socialEditRowOf(key: string, point: ContactPoint): SocialEditRow {
  const value = point.value ?? ""
  return { key, id: point.id, isNew: false, label: point.label ?? "", value, savedValue: value, removed: false }
}

/** An empty new row keyed `key`. */
export function newSocialEditRow(key: string): SocialEditRow {
  return { key, id: null, isNew: true, label: "", value: "", savedValue: "", removed: false }
}

/** The rows a draft holds (a stored draft is JSON: anything malformed reads as none). */
export function socialDraftRows(value: unknown): SocialEditRow[] {
  const parsed = z.array(socialEditRowSchema).safeParse(value)
  return parsed.success ? parsed.data : []
}

/** One row as the draft compare reads it: its link · its edit state. */
function describeRow(row: SocialEditRow | undefined): string {
  if (!row) return ""
  const state = row.removed ? SECTION_MESSAGES.removedOnSave : row.isNew ? SECTION_MESSAGES.newNotSaved : ""
  return [row.value.trim(), state].filter((part) => part !== "").join(" · ")
}

/**
 * The draft conflict compare rows (F4): one per link whose stored row
 * differs from the current one (added, changed, struck through), named by
 * its saved link (a new row: its link).
 */
export function socialDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  const mine = socialDraftRows(draft.rows)
  const now = socialDraftRows(current.rows)
  const keys = [...new Set([...mine.map((row) => row.key), ...now.map((row) => row.key)])]
  return keys.flatMap((key) => {
    const a = mine.find((row) => row.key === key)
    const b = now.find((row) => row.key === key)
    const left = describeRow(a)
    const right = describeRow(b)
    if (left === right) return []
    const named = (a ?? b) as SocialEditRow
    return [{ field: `rows.${key}`, label: (named.isNew ? named.value : named.savedValue).trim(), mine: left, current: right }]
  })
}
