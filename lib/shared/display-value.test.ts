import { describe, expect, it } from "vitest"
import { isNotProvided, joinProvided, providedOrNull } from "./display-value"
import { CHECKOUT_URL, INTERNAL_EMAIL_DOMAINS, isInternalEmail } from "./profile-constants"

describe("isNotProvided (PM3)", () => {
  it.each([null, undefined, "", "   ", "n/a", "N/A", " N/a ", -1, "-1", " -1 ", []])("%j reads Not provided", (value) => {
    expect(isNotProvided(value)).toBe(true)
  })

  it.each([0, "0", false, true, "Ann", "n/a/b", "na", "-10", -2, 1.5, ["x"], {}])("%j is a value", (value) => {
    expect(isNotProvided(value)).toBe(false)
  })

  it("providedOrNull keeps values and drops placeholders", () => {
    expect(providedOrNull("Ann")).toBe("Ann")
    expect(providedOrNull("n/a")).toBeNull()
    expect(providedOrNull(0)).toBe(0)
  })
})

describe("joinProvided", () => {
  it("skips a middle name that is n/a (Story 10.2) and trims parts", () => {
    expect(joinProvided(["Ann", "n/a", "Lee"])).toBe("Ann Lee")
    expect(joinProvided([" Ann ", "Marie", null, undefined, "", "Lee"])).toBe("Ann Marie Lee")
    expect(joinProvided(["Springfield", "IL"], ", ")).toBe("Springfield, IL")
    expect(joinProvided(["N/A", null])).toBe("")
  })
})

describe("profile constants (Story 10.1)", () => {
  it("holds the checkout URL and internal domains", () => {
    expect(CHECKOUT_URL).toBe("https://learnmore.1health.io/product-checkout")
    expect(INTERNAL_EMAIL_DOMAINS).toEqual(["@1health.io", "@tachin.ai"])
  })

  it.each([
    ["ann@1health.io", true],
    [" Ann@1Health.IO ", true],
    ["bo@tachin.ai", true],
    ["ann@not1health.io", false],
    ["ann@1health.io.evil.com", false],
    ["@1health.io", false],
    ["ann@gmail.com", false],
    ["", false],
    [null, false],
    [undefined, false],
  ] as const)("isInternalEmail(%j) is %s", (email, expected) => {
    expect(isInternalEmail(email)).toBe(expected)
  })
})
