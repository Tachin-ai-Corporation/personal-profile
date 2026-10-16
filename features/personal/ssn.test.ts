import { describe, expect, it } from "vitest"
import { caretAfterDigits, digitsBefore } from "@/lib/shared/dates"
import { formatSsnInput, insertedText, isCompleteSsn, isMaskedSsn, maskDigits, replaceMask, SSN_DIGITS, toSsnFormValue } from "./ssn"

/** Story 2.3 (NG-9022): the SSN text rules. */

describe("isMaskedSsn / toSsnFormValue", () => {
  it.each(["***-**-1234", "*****1234", "***-**-****", "*** ** 1234"])("%j is a safe mask", (value) => {
    expect(isMaskedSsn(value)).toBe(true)
    expect(toSsnFormValue(value)).toBe(value)
  })

  it.each([
    ["a full SSN", "123-45-6789"],
    ["nine digits", "123456789"],
    ["five digits behind a mask", "***-*1-2345"],
    ["text around a mask", "***-**-1234 (Ann)"],
    ["no asterisk", "1234"],
    ["n/a", "n/a"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
  ])("%s is not a mask (the form holds \"\")", (_name, value) => {
    expect(isMaskedSsn(value)).toBe(false)
    expect(toSsnFormValue(value)).toBe("")
  })

  it("maskDigits gives the digits a mask shows", () => {
    expect(maskDigits("***-**-1234")).toBe("1234")
    expect(maskDigits("***-**-****")).toBe("")
  })
})

describe("formatSsnInput", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["123", "123"],
    ["1234", "123-4"],
    ["12345", "123-45"],
    ["123456", "123-45-6"],
    ["123456789", "123-45-6789"],
    ["123 45 6789", "123-45-6789"],
    ["123-45-6789", "123-45-6789"],
    [" 123.45.6789 ", "123-45-6789"],
    ["1234567890", "123-45-6789"],
    ["abc", ""],
    ["12a3", "123"],
    ["***-**-1234", "123-4"],
  ])("%j → %j", (raw, formatted) => {
    expect(formatSsnInput(raw)).toBe(formatted)
  })

  it("keeps at most nine digits", () => {
    expect(SSN_DIGITS).toBe(9)
    expect(formatSsnInput("9".repeat(20)).replace(/\D/g, "")).toHaveLength(9)
  })

  it("insertedText is what an edit inserted", () => {
    expect(insertedText("12", "12123456789")).toBe("123456789")
    expect(insertedText("123-45-6789", "9876543210")).toBe("9876543210")
    expect(insertedText("123-45", "123-45")).toBe("")
  })
})

describe("isCompleteSsn", () => {
  it.each([
    ["123-45-6789", true],
    ["123456789", false],
    ["123-45-678", false],
    ["123-45", false],
    ["", false],
    ["***-**-1234", false],
    ["123-45-67890", false],
  ])("%j → %s", (value, complete) => {
    expect(isCompleteSsn(value)).toBe(complete)
  })
})

describe("replaceMask (typing over the mask)", () => {
  const MASK = "***-**-1234"

  it.each([
    ["select all, type 1", "1", "1"],
    ["type 5 at the end", `${MASK}5`, "5"],
    ["type 2 in the middle", "***-**-12234", "2"],
    ["type at the start", `9${MASK}`, "9"],
    ["paste 123456789 over all", "123456789", "123-45-6789"],
    ["paste 123 45 6789 over all", "123 45 6789", "123-45-6789"],
    ["paste 123-45-6789 at the end", `${MASK}123-45-6789`, "123-45-6789"],
  ])("%s → the typed digits", (_name, raw, next) => {
    expect(replaceMask(MASK, raw)).toBe(next)
  })

  it.each([
    ["Backspace at the end", "***-**-123"],
    ["Delete at the start", "**-**-1234"],
    ["select all, Backspace", ""],
    ["select all, type a letter", "x"],
  ])("%s clears the field", (_name, raw) => {
    expect(replaceMask(MASK, raw)).toBe("")
  })

  it("with the selection the edit replaced, the inserted text is exact (even next to matching mask digits)", () => {
    expect(replaceMask(MASK, "***-**123456789", { start: 6, end: 11 })).toBe("123-45-6789")
    expect(replaceMask(MASK, "***-**-5", { start: 7, end: 11 })).toBe("5")
    expect(replaceMask(MASK, "***-**-12345", { start: 11, end: 11 })).toBe("5")
    expect(replaceMask(MASK, "123456789", { start: 0, end: 11 })).toBe("123-45-6789")
    expect(replaceMask(MASK, "***-**-", { start: 7, end: 11 })).toBe("")
    expect(replaceMask(MASK, `${MASK}x`, { start: 11, end: 11 })).toBeNull()
    // A selection that doesn't explain the edit falls back to the diff.
    expect(replaceMask(MASK, "***-**-123", { start: 11, end: 11 })).toBe("")
    expect(replaceMask(MASK, "x", { start: 11, end: 11 })).toBe("")
  })

  it("without a selection: no asterisk left means every digit was typed; otherwise the diff (which can't tell kept digits from typed ones)", () => {
    expect(replaceMask("***-**-6789", "123456789")).toBe("123-45-6789")
    expect(replaceMask("***-**-6789", "***-**123456789")).toBe("123-45")
  })

  it("an inserted letter alone changes nothing", () => {
    expect(replaceMask(MASK, `${MASK}x`)).toBeNull()
    expect(replaceMask(MASK, MASK)).toBeNull()
  })
})

describe("caret helpers (lib/shared/dates) on SSN text", () => {
  it("keep the caret on the same digit after formatting", () => {
    // Typed "4" after "123" in "123": raw "1234", caret after 4 digits → after "123-4".
    expect(caretAfterDigits(formatSsnInput("1234"), digitsBefore("1234", 4))).toBe(5)
    // A digit inserted before the hyphen: "12x3-45" → "123-45" with the caret after the third digit.
    expect(caretAfterDigits("123-45", digitsBefore("1293-45", 3))).toBe(3)
  })
})
