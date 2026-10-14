/**
 * Calendar dates as plain strings (no `Date`, so no time-zone shift): the
 * backend `LocalDate` wire form `YYYY-MM-DD` and the display/input form
 * `MM/DD/YYYY`. Impossible dates (`02/30/1990`, month 13) are rejected.
 */

export interface CalendarDate {
  readonly year: number
  readonly month: number
  readonly day: number
}

const WIRE = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY = /^(\d{2})\/(\d{2})\/(\d{4})$/

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function checked(year: number, month: number, day: number): CalendarDate | null {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

const pad = (value: number, width: number): string => String(value).padStart(width, "0")

/** A real `YYYY-MM-DD` date, or `null`. */
export function parseWireDate(value: string | null | undefined): CalendarDate | null {
  const match = value ? WIRE.exec(value) : null
  return match ? checked(Number(match[1]), Number(match[2]), Number(match[3])) : null
}

/** A real `MM/DD/YYYY` date, or `null`. */
export function parseDisplayDate(value: string | null | undefined): CalendarDate | null {
  const match = value ? DISPLAY.exec(value.trim()) : null
  return match ? checked(Number(match[3]), Number(match[1]), Number(match[2])) : null
}

export function formatWireDate(date: CalendarDate): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}

export function formatDisplayDate(date: CalendarDate): string {
  return `${pad(date.month, 2)}/${pad(date.day, 2)}/${pad(date.year, 4)}`
}

/** `1990-02-28` → `02/28/1990`; anything that isn't a real wire date → `null`. */
export function wireToDisplayDate(value: string | null | undefined): string | null {
  const date = parseWireDate(value)
  return date ? formatDisplayDate(date) : null
}

/** `02/28/1990` → `1990-02-28`; anything that isn't a real display date → `null`. */
export function displayToWireDate(value: string | null | undefined): string | null {
  const date = parseDisplayDate(value)
  return date ? formatWireDate(date) : null
}

/** The local calendar date of `now` (the user's "today"). */
export function localCalendarDate(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

/** Negative, zero or positive as `a` is before, equal to or after `b`. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

/** Java `LocalDate.minusYears`: Feb 29 becomes Feb 28 in a non-leap year. */
export function minusYears(date: CalendarDate, years: number): CalendarDate {
  const year = date.year - years
  const day = date.month === 2 && date.day === 29 && !isLeapYear(year) ? 28 : date.day
  return { year, month: date.month, day }
}

/**
 * Whole years from `birth` to `on` (negative when `birth` is later), as Java
 * `Period.between(birth, on).getYears()`: a Feb 29 birthday reaches the next
 * year on Mar 1 in non-leap years.
 */
export function wholeYearsBetween(birth: CalendarDate, on: CalendarDate): number {
  const beforeBirthday = on.month < birth.month || (on.month === birth.month && on.day < birth.day)
  return on.year - birth.year - (beforeBirthday ? 1 : 0)
}

/** Inclusive `YYYY-MM-DD` bounds; a missing end is open. */
export interface DateBounds {
  readonly min?: string
  readonly max?: string
}

/** Whether a real `YYYY-MM-DD` date is inside `bounds` (inclusive). Invalid dates → false; an invalid bound is ignored. */
export function isWireDateWithin(value: string | null | undefined, bounds: DateBounds): boolean {
  const date = parseWireDate(value)
  if (!date) return false
  const min = parseWireDate(bounds.min)
  const max = parseWireDate(bounds.max)
  return (!min || compareDates(date, min) >= 0) && (!max || compareDates(date, max) <= 0)
}

/** The length of a complete masked display date, `MM/DD/YYYY`. */
export const DISPLAY_DATE_LENGTH = 10

/**
 * The `MM/DD/YYYY` input mask: keeps the first 8 digits of `raw` and inserts
 * each slash once a digit follows it (`0229` → `02/29`, `022` → `02/2`), so
 * Backspace over a slash is never undone by the mask.
 */
export function maskDisplayDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/")
}

/** How many digits `text` has before `position` (keeps the caret on the same digit after masking). */
export function digitsBefore(text: string, position: number): number {
  return text.slice(0, position).replace(/\D/g, "").length
}

/** The caret position in masked `text` right after its `digits`-th digit (0 → the start). */
export function caretAfterDigits(text: string, digits: number): number {
  if (digits <= 0) return 0
  let seen = 0
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) seen += 1
    if (seen === digits) return index + 1
  }
  return text.length
}

/** A pasted whole date, `MM/DD/YYYY` or `YYYY-MM-DD` (surrounding space ignored), as display text; anything else → `null`. */
export function pastedDisplayDate(pasted: string): string | null {
  const text = pasted.trim()
  return wireToDisplayDate(text) ?? (parseDisplayDate(text) ? text : null)
}
