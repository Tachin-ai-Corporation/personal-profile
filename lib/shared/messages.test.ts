import { describe, expect, it } from "vitest"
import { LAUNCH_ERROR_COPY, normalizeLaunchErrorReason, type LaunchErrorReason } from "./messages"

/**
 * `normalizeLaunchErrorReason` maps unknown/missing reasons to `invalid` (so the
 * raw reason is never trusted) and each known reason to itself.
 */
describe("normalizeLaunchErrorReason", () => {
  const known: LaunchErrorReason[] = ["expired", "used", "invalid", "tenant", "cookies", "config", "disabled"]

  for (const reason of known) {
    it(`maps the known reason "${reason}" to itself`, () => {
      expect(normalizeLaunchErrorReason(reason)).toBe(reason)
      expect(LAUNCH_ERROR_COPY[reason]).toBeTruthy()
    })
  }

  it("maps an unknown reason to invalid", () => {
    expect(normalizeLaunchErrorReason("whatever")).toBe("invalid")
    expect(normalizeLaunchErrorReason("tenant-bogus")).toBe("invalid")
  })

  it("maps a missing reason to invalid", () => {
    expect(normalizeLaunchErrorReason(undefined)).toBe("invalid")
    expect(normalizeLaunchErrorReason(null)).toBe("invalid")
    expect(normalizeLaunchErrorReason("")).toBe("invalid")
  })

  it("maps prototype-chain keys to invalid (not Object.prototype)", () => {
    expect(normalizeLaunchErrorReason("__proto__")).toBe("invalid")
    expect(normalizeLaunchErrorReason("constructor")).toBe("invalid")
    expect(normalizeLaunchErrorReason("hasOwnProperty")).toBe("invalid")
    // And the resolved copy is a real variant with a title/body.
    expect(LAUNCH_ERROR_COPY[normalizeLaunchErrorReason("__proto__")].title).toBeTruthy()
  })
})
