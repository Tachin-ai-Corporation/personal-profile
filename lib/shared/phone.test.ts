import { describe, expect, it } from "vitest"
import { formatPhoneDisplay, normalizeRegion } from "./phone"

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
