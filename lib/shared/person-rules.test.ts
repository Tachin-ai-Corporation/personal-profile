import { describe, expect, it } from "vitest"
import { birthDateAgeRange, birthDateBounds, hasProctorRole, isBirthDateInRange, nameIssue, NAME_MAX_LENGTH, normalizeName, textIssue } from "./person-rules"

describe("nameIssue", () => {
  it.each([
    ["Ann", null],
    ["  Ann  ", null],
    ["x".repeat(NAME_MAX_LENGTH), null],
    [` ${"x".repeat(NAME_MAX_LENGTH)} `, null],
    ["😀".repeat(NAME_MAX_LENGTH), null],
    ["José-María O'Neil", null],
    ["x".repeat(NAME_MAX_LENGTH + 1), "tooLong"],
    ["", "required"],
    ["   ", "required"],
    [null, "required"],
    [undefined, "required"],
    ["An\u0000n", "notPrintable"],
    ["An\nn", "notPrintable"],
    ["Ann", "notPrintable"],
    ["An​n", "notPrintable"],
    ["An‮n", "notPrintable"],
  ] as const)("%j → %j", (value, issue) => {
    expect(nameIssue(value)).toBe(issue)
  })

  it("normalizes by trimming, and takes other maxima", () => {
    expect(normalizeName("  Ann ")).toBe("Ann")
    expect(normalizeName(null)).toBe("")
    expect(textIssue("Jr.", 10)).toBeNull()
    expect(textIssue("x".repeat(11), 10)).toBe("tooLong")
  })
})

describe("birth-date age rule", () => {
  const today = new Date(2026, 9, 14)

  it("is 18–120, or 21–120 only for the exact Proctor role", () => {
    expect(birthDateAgeRange(["Patient"])).toEqual({ min: 18, max: 120 })
    expect(birthDateAgeRange(["Patient", "Proctor"])).toEqual({ min: 21, max: 120 })
    expect(birthDateAgeRange(["proctor"])).toEqual({ min: 18, max: 120 })
    expect(birthDateAgeRange(null)).toEqual({ min: 18, max: 120 })
    expect(hasProctorRole(undefined)).toBe(false)
  })

  it.each([
    ["2008-10-14", [], true],
    ["2008-10-15", [], false],
    ["2005-10-14", ["Proctor"], true],
    ["2005-10-15", ["Proctor"], false],
    ["1906-10-14", [], true],
    ["1906-10-15", [], true],
    ["1906-10-13", [], false],
    ["1905-10-15", [], false],
    ["2030-01-01", [], false],
    ["2008-02-30", [], false],
    ["10/14/2008", [], false],
    [null, [], false],
  ] as const)("%j with roles %j → %s (exactly 120 passes, 120 y and a day doesn't)", (date, roles, expected) => {
    expect(isBirthDateInRange(date, roles, today)).toBe(expected)
  })

  it("a Feb 29 birthday turns 18 on Mar 1 of a non-leap year", () => {
    expect(isBirthDateInRange("2008-02-29", [], new Date(2026, 1, 28))).toBe(false)
    expect(isBirthDateInRange("2008-02-29", [], new Date(2026, 2, 1))).toBe(true)
    expect(isBirthDateInRange("2008-02-29", [], new Date(2026, 1, 27))).toBe(false)
  })

  it("on Feb 29 both bounds follow Java minusYears", () => {
    const leapDay = new Date(2028, 1, 29)
    expect(isBirthDateInRange("1908-02-29", [], leapDay)).toBe(true)
    expect(isBirthDateInRange("1908-02-28", [], leapDay)).toBe(false)
    expect(isBirthDateInRange("2010-02-28", [], leapDay)).toBe(true)
    expect(isBirthDateInRange("2010-03-01", [], leapDay)).toBe(false)
  })
})

describe("birthDateBounds (F5-1 calendar bounds)", () => {
  it("is today − 120 years to today − 18 years, or − 21 for a Proctor", () => {
    expect(birthDateBounds([], new Date(2026, 9, 14))).toEqual({ min: "1906-10-14", max: "2008-10-14" })
    expect(birthDateBounds(["Proctor"], new Date(2026, 9, 14))).toEqual({ min: "1906-10-14", max: "2005-10-14" })
    expect(birthDateBounds(null, new Date(2026, 9, 14))).toEqual({ min: "1906-10-14", max: "2008-10-14" })
  })

  it("matches isBirthDateInRange at both ends, including on Feb 29 (Java minusYears)", () => {
    const leapDay = new Date(2028, 1, 29)
    const bounds = birthDateBounds([], leapDay)
    expect(bounds).toEqual({ min: "1908-02-29", max: "2010-02-28" })
    expect(isBirthDateInRange(bounds.min, [], leapDay)).toBe(true)
    expect(isBirthDateInRange(bounds.max, [], leapDay)).toBe(true)
  })
})
