import { describe, expect, it } from "vitest"
import { isSwitchedOff, killSwitchFor } from "./kill-switch"

describe("killSwitchFor", () => {
  it.each([
    ["/", "pp"],
    ["/auth", "pp"],
    ["/auth/", "pp"],
    ["/api/1h/v2/user/myself", "pp"],
    ["/api/pp/profile-picture-id", "pp"],
    ["/api/pp", "pp"],
    ["/api/places/autocomplete", "pp"],
    ["/api/session/refresh", "pp"],
    ["/api/session/ping", "pp"],
    ["/account", "account"],
    ["/account/", "account"],
    ["/account/x", "account"],
    ["//account", "account"],
    ["/%61ccount", "account"],
    ["/handoff/portal", "account"],
    ["/api/pp/mfa/validate", "account"],
    ["/api/pp/org-logo/12", "account"],
    ["/api/pp/practice-support", "account"],
    ["/api/session/logout", null],
    ["/api/token", null],
    ["/api/pp-other", null],
    ["/accounts", null],
    ["/api/pp/mfa-other", "pp"],
    ["/_next/static/chunk.js", null],
    ["/favicon.png", null],
    ["/disabled", null],
    ["/test-fixtures/leave-guard", null],
    ["/%E0%A4%A", null],
  ])("%s → %s", (path, expected) => {
    expect(killSwitchFor(path)).toBe(expected)
  })
})

describe("isSwitchedOff", () => {
  it.each([
    ["pp", false, false, false],
    ["pp", true, false, true],
    ["pp", false, true, false],
    ["account", false, false, false],
    ["account", true, false, true],
    ["account", false, true, true],
  ] as const)("%s with PP_DISABLED=%s ACCOUNT_DISABLED=%s → %s", (killSwitch, pp, account, expected) => {
    expect(isSwitchedOff(killSwitch, { PP_DISABLED: pp, ACCOUNT_DISABLED: account })).toBe(expected)
  })
})
