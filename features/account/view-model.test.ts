import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toContactPoints, toMyself, type Myself } from "@/lib/api"
import { contactPointWire, myselfWire } from "@/test/myself-fixture"
import { toAccountView } from "./view-model"

function identity(overrides: Record<string, unknown> = {}): Myself {
  return toMyself(myselfWire(overrides))!
}

beforeEach(() => {
  // Freeze a local calendar date; exercise the real default `new Date()` path.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 16, 0, 15))
})
afterEach(() => vi.useRealTimers())

describe("toAccountView (Story 7.4)", () => {
  it("maps all ten fields and always masks the password", () => {
    expect(toAccountView(identity({ password: "never display this" }))).toEqual({
      firstName: "Ann", lastName: "Lee", username: "ann.lee", password: "********",
      primaryEmail: "ann.lee@example.com", primaryPhone: "+1 (415) 555-2671",
      birthDate: "04/15/1990", preferredLanguage: "English", timeZone: "Central",
      locale: "English - United States",
    })
  })

  it.each([null, undefined, "", " \t\n ", "n/a", " N/A ", "-1", -1])("normalizes PM3 absence %j in every optional field, with password and locale exceptions", (value) => {
    const fields = ["firstName", "lastName", "username", "email", "phoneNumber", "birthDate", "preferredLanguage", "timeZone", "locale"]
    const view = toAccountView(identity(Object.fromEntries(fields.map((key) => [key, value]))))
    expect(view).toEqual({
      firstName: null, lastName: null, username: null, password: "********",
      primaryEmail: null, primaryPhone: null, birthDate: null, preferredLanguage: null,
      timeZone: null, locale: "English - United States",
    })
  })

  it("trims surrounding whitespace while preserving meaningful interior characters and leaves the source untouched", () => {
    const source = Object.freeze(identity({
      firstName: "  Ana  María ", lastName: " O'Neil-Smith ", username: " user.name ",
      email: " user@example.com ", phoneNumber: " 4155552125 ", preferredLanguage: " en ",
      timeZone: " America/Chicago ", locale: " en-US ",
    }))
    expect(toAccountView(source)).toMatchObject({
      firstName: "Ana  María", lastName: "O'Neil-Smith", username: "user.name",
      primaryEmail: "user@example.com", primaryPhone: "+1 (415) 555-2125",
      preferredLanguage: "English", timeZone: "Central", locale: "English - United States",
    })
    expect(source.firstName).toBe("  Ana  María ")
    expect(source.phoneNumber).toBe(" 4155552125 ")
  })

  it("preserves trimmed unlisted language, time-zone and locale codes", () => {
    expect(toAccountView(identity({ preferredLanguage: " fr ", timeZone: " Europe/Paris ", locale: " fr-FR " }))).toMatchObject({
      preferredLanguage: "fr", timeZone: "Europe/Paris", locale: "fr-FR",
    })
  })

  it.each([
    ["Pacific/Honolulu", "Hawaiian"], ["America/Anchorage", "Alaska"],
    ["America/Los_Angeles", "Pacific"], ["America/Denver", "Mountain"],
    ["America/Chicago", "Central"], ["America/New_York", "Eastern"],
  ])("labels approved zone %s as %s", (timeZone, expected) => {
    expect(toAccountView(identity({ timeZone })).timeZone).toBe(expected)
  })

  it.each([
    ["2008-10-16", ["Patient"], "10/16/2008"],
    ["2008-10-17", ["Patient"], null],
    ["2005-10-16", ["Patient", "Proctor"], "10/16/2005"],
    ["2005-10-17", ["Proctor"], null],
    ["2008-10-16", ["Proctor"], null],
    ["2008-10-16", null, "10/16/2008"],
    ["1906-10-16", ["Patient"], "10/16/1906"],
    ["1906-10-16", ["Proctor"], "10/16/1906"],
    ["1906-10-15", ["Patient"], null],
    ["1906-10-15", ["Proctor"], null],
    ["1905-10-16", ["Patient"], null],
    ["2027-01-01", ["Patient"], null],
    ["1990-02-30", ["Patient"], null],
    ["not a date", ["Patient"], null],
    [null, ["Patient"], null],
  ])("birth date %j with roles %j at local today respects inclusive 18/21–120 bounds", (birthDate, roles, expected) => {
    // Override the domain field too: malformed dates can reach a read model independently of wire mapping.
    expect(toAccountView({ ...identity({ roles }), birthDate }).birthDate).toBe(expected)
  })

  it.each([
    [new Date(2026, 1, 28), "2008-02-29", null],
    [new Date(2026, 2, 1), "2008-02-29", "02/29/2008"],
    [new Date(2024, 1, 29), "2006-02-28", "02/28/2006"],
    [new Date(2024, 1, 29), "2006-03-01", null],
  ])("uses shared local leap-day bounds at %s for %s", (today, birthDate, expected) => {
    vi.setSystemTime(today)
    expect(toAccountView(identity({ birthDate })).birthDate).toBe(expected)
  })

  it("accepts an explicit local today for deterministic consumers", () => {
    expect(toAccountView(identity({ birthDate: "2008-10-17" }), undefined, new Date(2026, 9, 17)).birthDate).toBe("10/17/2008")
  })

  it.each([
    ["4155552125", undefined, "+1 (415) 555-2125"],
    ["4155552125", [], "+1 (415) 555-2125"],
    ["02071838750", [{ label: "Primary", phoneNumberRegion: "GB" }], "+44 20 7183 8750"],
    ["02071838750", [{ value: "020 7183 8750", label: "Home", phoneNumberRegion: "gb" }], "+44 20 7183 8750"],
    ["4155552125", [{ phoneNumberRegion: "n/a" }], "+1 (415) 555-2125"],
    ["4155552125", [{ phoneNumberRegion: null }], "+1 (415) 555-2125"],
    ["02071838750", [{ type: "Landline", phoneNumberRegion: "GB" }], "02071838750"],
    ["not a phone", undefined, "not a phone"],
    ["+442071838750", undefined, "+44 20 7183 8750"],
  ] as const)("formats %s using cached Mobile rows %j", (phoneNumber, rows, expected) => {
    const contacts = rows === undefined ? undefined : toContactPoints(rows.map((row) => contactPointWire(row)))!
    expect(toAccountView(identity({ phoneNumber }), contacts).primaryPhone).toBe(expected)
  })
})
