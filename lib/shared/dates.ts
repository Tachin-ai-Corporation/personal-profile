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
