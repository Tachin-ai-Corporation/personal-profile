import { describe, expect, it } from "vitest"
import { initials } from "./initials"

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
