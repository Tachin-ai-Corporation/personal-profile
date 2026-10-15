import { describe, expect, it } from "vitest"
import { initials, orgInitials } from "./initials"

describe("initials", () => {
  it("builds one uppercase initial per non-blank name", () => {
    expect(initials("ann", "lee")).toBe("AL")
    expect(initials("", "lee")).toBe("L")
    expect(initials(" ", "")).toBe("")
    expect(initials(null, undefined)).toBe("")
    expect(initials("Acme")).toBe("A")
  })

  it("never splits an astral character", () => {
    expect(initials("😀nn", "𝒜lee")).toBe("😀𝒜")
    expect(initials("😀", "")).toBe("😀")
  })
})

describe("orgInitials (Story 10.1)", () => {
  it.each([
    ["Acme Health Labs", "AH"],
    ["acme labs", "AL"],
    ["1health Labs", "HL"],
    ["A & B Corp", "AB"],
    ["Acme", "AC"],
    ["A", "A"],
    ["  Mayo   Clinic  ", "MC"],
    ["Ünïon Médica", "ÜM"],
    ["42 & 7", "?"],
    ["", "?"],
    ["   ", "?"],
    [null, "?"],
    [undefined, "?"],
  ] as const)("%j → %j", (name, expected) => {
    expect(orgInitials(name)).toBe(expected)
  })
})
