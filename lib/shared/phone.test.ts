import { describe, expect, it } from "vitest"
import {
  dialCodeOf,
  EMPTY_PHONE_INPUT,
  formatPhoneDisplay,
  formatPhoneInput,
  isPhoneRegion,
  isPhoneTooLong,
  clampPhoneInput,
  normalizeRegion,
  parseInternationalPhone,
  phoneDigits,
  phoneInputFrom,
  phoneIssue,
  phoneRegions,
  regionFlag,
  toE164,
} from "./phone"

describe("normalizeRegion", () => {
  it.each([
    ["US", "us"],
    [" gb ", "gb"],
    ["", "us"],
    ["n/a", "us"],
    ["N/A", "us"],
    [null, "us"],
    [undefined, "us"],
  ])("%j → %j", (region, expected) => {
    expect(normalizeRegion(region)).toBe(expected)
  })
})

describe("formatPhoneDisplay", () => {
  it.each([
    ["+14155552125", "us", "+1 (415) 555-2125"],
    ["+14155512125", null, "+1 (415) 551-2125"],
    ["4155552125", "n/a", "+1 (415) 555-2125"],
    ["+442071838750", "gb", "+44 20 7183 8750"],
    ["02071838750", "GB", "+44 20 7183 8750"],
    ["+442071838750", "us", "+44 20 7183 8750"],
    ["+14165550123", "ca", "+1 (416) 555-0123"],
    ["4165550123", "CA", "+1 (416) 555-0123"],
    ["+17875550123", "pr", "+1 (787) 555-0123"],
    ["+18005550123", "us", "+1 (800) 555-0123"],
    ["+14165550123", "gb", "+1 (416) 555-0123"],
    ["02071838750", "us", "02071838750"],
    ["+14155552125", "zz", "+1 (415) 555-2125"],
    ["not a phone", "us", "not a phone"],
    ["+1 41", "us", "+1 41"],
    ["", "us", ""],
  ])("%j in %j → %j", (value, region, expected) => {
    expect(formatPhoneDisplay(value, region)).toBe(expected)
  })
})

describe("regions (F6-2)", () => {
  it("lists every libphonenumber region once, sorted by name, with dial code and flag", () => {
    const regions = phoneRegions()
    expect(regions.length).toBeGreaterThan(200)
    expect(new Set(regions.map((r) => r.region)).size).toBe(regions.length)
    expect(regions.find((r) => r.region === "us")).toEqual({ region: "us", dialCode: "1", name: "United States", flag: "🇺🇸" })
    expect(regions.find((r) => r.region === "gb")?.dialCode).toBe("44")
    const names = regions.map((r) => r.name)
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, "en-US")))
  })

  it("caches the list per locale", () => {
    expect(phoneRegions("en-US")).toBe(phoneRegions("en-US"))
    expect(phoneRegions("es").find((r) => r.region === "de")?.name).toBe("Alemania")
  })

  it.each([
    ["us", "🇺🇸"],
    [" GB ", "🇬🇧"],
    ["usa", ""],
    ["1x", ""],
  ])("regionFlag(%j) → %j", (region, flag) => {
    expect(regionFlag(region)).toBe(flag)
  })

  it.each([
    ["us", "1"],
    ["GB", "44"],
    ["", "1"],
    ["zz", "1"],
    [null, "1"],
  ])("dialCodeOf(%j) → %j", (region, code) => {
    expect(dialCodeOf(region)).toBe(code)
  })

  it.each([
    ["us", true],
    ["GB", true],
    ["n/a", true],
    ["zz", false],
  ])("isPhoneRegion(%j) → %j", (region, known) => {
    expect(isPhoneRegion(region)).toBe(known)
  })
})

describe("typing helpers", () => {
  it("keeps only digits", () => {
    expect(phoneDigits("+1 (415) 555-2125")).toBe("14155552125")
  })

  it.each([
    ["4155552125", "us", false],
    ["41555521251", "us", true],
    ["", "us", false],
    ["207183875012345", "gb", true],
  ])("isPhoneTooLong(%j, %j) → %j", (text, region, tooLong) => {
    expect(isPhoneTooLong(text, region)).toBe(tooLong)
  })

  it.each([
    ["4155552125", "us", "(415) 555-2125"],
    ["2071838750", "gb", "020 7183 8750"],
    ["415555", "us", "(415) 555"],
    [" - ", "us", "-"],
    ["", "us", ""],
    // An international number being typed is never reread as a national one.
    ["+44 20 7183 8750", "us", "+44 20 7183 8750"],
    ["+4420", "us", "+44 20"],
  ])("formatPhoneInput(%j, %j) → %j", (text, region, formatted) => {
    expect(formatPhoneInput(text, region)).toBe(formatted)
  })

  it.each([
    ["4155552125", "us", "4155552125"],
    ["(415) 555-2125 99", "us", "4155552125"],
    ["2071838750123456789", "gb", "2071838750"],
  ])("clampPhoneInput(%j, %j) → %j (trailing digits dropped)", (text, region, clamped) => {
    expect(clampPhoneInput(text, region)).toBe(clamped)
  })

  it("parses an international paste into its region", () => {
    expect(parseInternationalPhone(" +44 20 7183 8750")).toEqual({ region: "gb", national: "020 7183 8750" })
    expect(parseInternationalPhone("4155552125")).toBeNull()
    expect(parseInternationalPhone("+999")).toBeNull()
  })
})

describe("phoneInputFrom", () => {
  it.each([
    ["+442071838750", "us", { region: "gb", national: "020 7183 8750" }],
    ["4155552125", "n/a", { region: "us", national: "(415) 555-2125" }],
    ["", "gb", { region: "gb", national: "" }],
    [null, "zz", { region: "us", national: "" }],
    ["abc", "zz", { region: "us", national: "abc" }],
    ["+80012345678", "us", { region: "us", national: "1234 5678" }],
  ])("%j in %j → %j", (value, region, expected) => {
    expect(phoneInputFrom(value, region)).toEqual(expected)
  })
})

describe("phoneIssue", () => {
  it.each([
    [EMPTY_PHONE_INPUT, "required"],
    [{ region: "us", national: "(415) 555-2125" }, null],
    [{ region: "us", national: "415 555 212" }, "tenDigits"],
    // A trunk "1" is not one of the 10 national digits.
    [{ region: "us", national: "1 415 555 212" }, "tenDigits"],
    [{ region: "us", national: "14155552125" }, null],
    [{ region: "ca", national: "416 555 0123" }, null],
    [{ region: "gb", national: "020 7183 8750" }, null],
    [{ region: "gb", national: "123" }, "invalid"],
  ] as const)("%j → %j", (value, issue) => {
    expect(phoneIssue(value)).toBe(issue)
  })
})

describe("toE164", () => {
  it.each([
    [{ region: "us", national: "(415) 555-2125" }, "+14155552125"],
    [{ region: "gb", national: "020 7183 8750" }, "+442071838750"],
    [{ region: "us", national: "" }, null],
    [{ region: "gb", national: "1" }, null],
    [{ region: "us", national: "14155552125" }, "+14155552125"],
    [{ region: "us", national: "1 415 555 212" }, null],
    [{ region: "gb", national: "123" }, null],
  ] as const)("%j → %j", (value, e164) => {
    expect(toE164(value)).toBe(e164)
  })
})
