import { afterEach, describe, expect, it, vi } from "vitest"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { handoffHref, isHandoffHref, isTenantId } from "./handoff"
import { isCancelled, type SaveResult } from "./nav-types"

afterEach(() => vi.unstubAllEnvs())

describe("handoffHref (Story 7.3 prerequisite, F6-1)", () => {
  it("the route path lives in the BFF contract", () => {
    expect(BFF_PATHS.handoffPortal).toBe("/handoff/portal")
  })

  it.each<[number | string, string]>([
    [7, "/handoff/portal?to=tenant&tenantId=7"],
    ["42", "/handoff/portal?to=tenant&tenantId=42"],
    [Number.MAX_SAFE_INTEGER, `/handoff/portal?to=tenant&tenantId=${Number.MAX_SAFE_INTEGER}`],
    ["9223372036854775807", "/handoff/portal?to=tenant&tenantId=9223372036854775807"],
  ])("tenant %s → %s", (tenantId, href) => {
    expect(handoffHref({ to: "tenant", tenantId })).toBe(href)
  })

  it("create-org", () => {
    expect(handoffHref({ to: "create-org" })).toBe("/handoff/portal?to=create-org")
  })

  const BAD: readonly (number | string)[] = [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, "", "0", "000", "+5", "-5", "1.0", "1e3", "12345678901234567890", "1@evil.example", "//evil.example", "%31", "1\n2", " 1"]

  it.each(BAD)("tenant %j throws outside production", (tenantId) => {
    expect(() => handoffHref({ to: "tenant", tenantId })).toThrow(/tenantId/)
    expect(isTenantId(tenantId)).toBe(false)
  })

  it.each(BAD)("tenant %j → the bare route in production", (tenantId) => {
    vi.stubEnv("NODE_ENV", "production")
    expect(handoffHref({ to: "tenant", tenantId })).toBe("/handoff/portal")
  })

  it("isHandoffHref accepts only the route, bare or with a query", () => {
    expect(isHandoffHref("/handoff/portal")).toBe(true)
    expect(isHandoffHref("/handoff/portal?to=create-org")).toBe(true)
    for (const href of ["/handoff/portalx", "/handoff/portal/x", "/handoff", "https://x/handoff/portal", "//handoff/portal"]) {
      expect(isHandoffHref(href)).toBe(false)
    }
  })
})

describe("isCancelled (F6-1)", () => {
  it("only a CANCELLED failure", () => {
    const results: SaveResult[] = [{ ok: true }, { ok: false, error: { code: "GENERIC" } }, { ok: false, error: {} }, { ok: false, error: { code: "CANCELLED" } }]
    expect(results.map(isCancelled)).toEqual([false, false, false, true])
  })
})
