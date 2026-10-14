import { describe, expect, it } from "vitest"
import {
  displayToWireDate,
  formatDisplayDate,
  formatWireDate,
  localCalendarDate,
  parseDisplayDate,
  parseWireDate,
  compareDates,
  minusYears,
  wholeYearsBetween,
  wireToDisplayDate,
} from "./dates"

describe("dates", () => {
  it.each([
    ["02/30/1990", null],
    ["13/01/1990", null],
    ["00/10/1990", null],
    ["01/00/1990", null],
    ["04/31/1990", null],
    ["02/29/1900", null],
    ["01/01/0000", null],
    ["02/29/2000", "2000-02-29"],
    ["02/29/2024", "2024-02-29"],
    ["02/29/2023", null],
    ["12/31/1990", "1990-12-31"],
    [" 06/15/1990 ", "1990-06-15"],
    ["6/15/1990", null],
    ["1990-06-15", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("display %j → wire %j", (display, wire) => {
    expect(displayToWireDate(display)).toBe(wire)
  })

  it.each([
    ["1990-02-28", "02/28/1990"],
    ["1990-02-30", null],
    ["1990-13-01", null],
    ["02/28/1990", null],
    ["1990-2-28", null],
    ["n/a", null],
    [null, null],
  ])("wire %j → display %j", (wire, display) => {
    expect(wireToDisplayDate(wire)).toBe(display)
  })

  it("parses and formats without a time-zone shift", () => {
    expect(parseWireDate("0999-01-02")).toEqual({ year: 999, month: 1, day: 2 })
    expect(formatWireDate({ year: 999, month: 1, day: 2 })).toBe("0999-01-02")
    expect(formatDisplayDate({ year: 1990, month: 1, day: 2 })).toBe("01/02/1990")
    expect(parseDisplayDate("01/02/1990")).toEqual({ year: 1990, month: 1, day: 2 })
    expect(localCalendarDate(new Date(2026, 0, 31, 23, 59))).toEqual({ year: 2026, month: 1, day: 31 })
  })

  it("counts whole years at a date", () => {
    const birth = { year: 2000, month: 6, day: 15 }
    expect(wholeYearsBetween(birth, { year: 2018, month: 6, day: 14 })).toBe(17)
    expect(wholeYearsBetween(birth, { year: 2018, month: 6, day: 15 })).toBe(18)
    expect(wholeYearsBetween(birth, { year: 2018, month: 5, day: 30 })).toBe(17)
    expect(wholeYearsBetween(birth, { year: 2018, month: 7, day: 1 })).toBe(18)
    expect(wholeYearsBetween(birth, { year: 1999, month: 1, day: 1 })).toBe(-2)
  })

  it("follows Java Period.between for a Feb 29 birthday", () => {
    const leapling = { year: 2008, month: 2, day: 29 }
    expect(wholeYearsBetween(leapling, { year: 2026, month: 2, day: 28 })).toBe(17)
    expect(wholeYearsBetween(leapling, { year: 2026, month: 3, day: 1 })).toBe(18)
    expect(wholeYearsBetween(leapling, { year: 2028, month: 2, day: 29 })).toBe(20)
  })

  it("subtracts years like Java minusYears and compares dates", () => {
    expect(minusYears({ year: 2028, month: 2, day: 29 }, 18)).toEqual({ year: 2010, month: 2, day: 28 })
    expect(minusYears({ year: 2028, month: 2, day: 29 }, 4)).toEqual({ year: 2024, month: 2, day: 29 })
    expect(minusYears({ year: 2026, month: 10, day: 14 }, 120)).toEqual({ year: 1906, month: 10, day: 14 })
    expect(compareDates({ year: 1, month: 1, day: 2 }, { year: 1, month: 1, day: 1 })).toBeGreaterThan(0)
    expect(compareDates({ year: 1, month: 2, day: 1 }, { year: 1, month: 3, day: 1 })).toBeLessThan(0)
    expect(compareDates({ year: 2, month: 1, day: 1 }, { year: 1, month: 12, day: 31 })).toBeGreaterThan(0)
    expect(compareDates({ year: 1, month: 1, day: 1 }, { year: 1, month: 1, day: 1 })).toBe(0)
  })
})
