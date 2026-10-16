/**
 * SSN text rules (Story 2.3, FR13): which saved values are a safe mask, the
 * `XXX-XX-XXXX` input format and what typing over the mask means. Pure: the
 * full SSN is never stored here.
 */

/** At most this many digits may show in a Masked SSN (the last four). */
const MASKED_SSN_MAX_DIGITS = 4

/** The digits an SSN has. */
export const SSN_DIGITS = 9

/** A complete SSN as the form holds it and the save sends it. */
const COMPLETE_SSN = /^\d{3}-\d{2}-\d{4}$/

/**
 * `true` only for a backend mask such as `***-**-1234`: asterisks, digits,
 * dashes and spaces, at least one `*`, and at most four digits. Anything
 * else (a full SSN sent by mistake, free text) is never shown.
 */
export function isMaskedSsn(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !/^[*\d\s-]+$/.test(value) || !value.includes("*")) return false
  return (value.match(/\d/g)?.length ?? 0) <= MASKED_SSN_MAX_DIGITS
}

/** The saved SSN as the form holds it: the safe mask, or `""` (none, cleared or unsafe). */
export function toSsnFormValue(value: string | null | undefined): string {
  return isMaskedSsn(value) ? value : ""
}

/** The digits a mask shows (`***-**-1234` → `1234`; `""` when it shows none). */
export function maskDigits(mask: string): string {
  return mask.replace(/\D/g, "")
}

/** Typed or pasted text as `XXX-XX-XXXX`: digits only (others ignored), at most nine, hyphens added (none trailing). */
export function formatSsnInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, SSN_DIGITS)
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)].filter(Boolean).join("-")
}

/** A complete SSN: `XXX-XX-XXXX`. */
export function isCompleteSsn(value: string): boolean {
  return COMPLETE_SSN.test(value)
}

/** Where the user's selection (or caret) sat in the shown mask just before an edit. */
export interface MaskSelection {
  readonly start: number
  readonly end: number
}

/** The part of `raw` that replaced `selection` of `mask`, or `null` when `raw` isn't such an edit. */
function insertedAt(mask: string, raw: string, { start, end }: MaskSelection): string | null {
  const head = mask.slice(0, start)
  const tail = mask.slice(end)
  if (start > end || raw.length < head.length + tail.length || !raw.startsWith(head) || !raw.endsWith(tail)) return null
  return raw.slice(head.length, raw.length - tail.length)
}

/** The part of `raw` between its longest common prefix and suffix with `mask` (no selection known). */
function insertedByDiff(mask: string, raw: string): { readonly inserted: string; readonly deleted: boolean } {
  let prefix = 0
  while (prefix < mask.length && prefix < raw.length && mask[prefix] === raw[prefix]) prefix += 1
  let suffix = 0
  while (suffix < mask.length - prefix && suffix < raw.length - prefix && mask[mask.length - 1 - suffix] === raw[raw.length - 1 - suffix]) suffix += 1
  return { inserted: raw.slice(prefix, raw.length - suffix), deleted: mask.length - prefix - suffix > 0 }
}

/** What an edit from `previous` to `raw` inserted (between their longest common prefix and suffix). */
export function insertedText(previous: string, raw: string): string {
  return insertedByDiff(previous, raw).inserted
}

/**
 * The next form value after the user edited the shown mask into `raw`:
 * the inserted digits replace the whole mask (typed or pasted, formatted);
 * a deletion from the mask clears the field (`""`); an insert with no
 * digits (a letter) changes nothing (`null`).
 *
 * The inserted text is what replaced `selection` (recorded on the key or
 * paste that made the edit). Without a usable selection: when no `*` is
 * left, the mask was overwritten and every digit of `raw` was typed;
 * otherwise it is what lies between the longest common prefix and suffix
 * of `mask` and `raw`.
 */
export function replaceMask(mask: string, raw: string, selection: MaskSelection | null = null): string | null {
  const selected = selection === null ? null : insertedAt(mask, raw, selection)
  if (selected !== null) {
    const typed = formatSsnInput(selected)
    if (typed !== "") return typed
    return selection !== null && (selection.end > selection.start || raw.length < mask.length) ? "" : null
  }
  if (!raw.includes("*")) return formatSsnInput(raw)
  const { inserted, deleted } = insertedByDiff(mask, raw)
  const typed = formatSsnInput(inserted)
  if (typed !== "") return typed
  return deleted ? "" : null
}
