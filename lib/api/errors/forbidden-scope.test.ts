import { describe, expect, it } from "vitest"
import { FORBIDDEN_SCOPE_TABLE, forbiddenScopeFor, normalizeForbiddenPath, type ForbiddenScope } from "@/lib/api"

/** The AD-23 403 owner table (epics Story 7.1 / FR103), row by row. */
describe("forbiddenScopeFor: the AD-23 owner table", () => {
  it.each<[string, ForbiddenScope]>([
    ["v2/user/contact-point/list", { owner: "account-pickers", level: "control" }],
    ["/api/1h/v2/user/contact-point/list?type=Email", { owner: "account-pickers", level: "control" }],
    ["v2/mfa/enable/totp", { owner: "authenticator", level: "section" }],
    ["v2/mfa/disable/totp", { owner: "authenticator", level: "section" }],
    ["/api/1h/v2/mfa/config", { owner: "authenticator", level: "section" }],
    ["/api/pp/mfa/validate", { owner: "authenticator", level: "section" }],
    ["v2/user/npi", { owner: "provider", level: "tab" }],
    ["/api/1h/v2/public/npi/list?entityTypeCode=1&limit=10", { owner: "provider", level: "tab" }],
    ["v2/user/register/npi", { owner: "provider", level: "tab" }],
    ["v2/user/organization/portal?size=12&page=0", { owner: "organizations", level: "tab" }],
    ["/api/pp/practice-support", { owner: "practice-popover", level: "popover" }],
    ["https://app.example.test/api/pp/practice-support?tenantId=9", { owner: "practice-popover", level: "popover" }],
  ])("%s → %j", (path, scope) => {
    expect(forbiddenScopeFor(path)).toEqual(scope)
  })

  it.each([
    "v2/user/myself",
    "v2/user/edit",
    "v2/mfa",
    "v2/user/npi/extra",
    "v2/health/npi/5/is-registered",
    "/api/pp/profile-picture-id",
    "/api/pp/org-logo/7",
    "user/contact-point/list/x",
    "",
  ])("%j has no owner (the surface that read it decides)", (path) => {
    expect(forbiddenScopeFor(path)).toBeNull()
  })

  it("covers every row of the published table, in order", () => {
    expect(FORBIDDEN_SCOPE_TABLE.map((row) => `${row.endpoint} → ${row.owner}/${row.level}`)).toEqual([
      "contact-point/list → account-pickers/control",
      "mfa/* → authenticator/section",
      "/api/pp/mfa/validate → authenticator/section",
      "user/npi → provider/tab",
      "public/npi/list → provider/tab",
      "user/register/npi → provider/tab",
      "user/organization/portal → organizations/tab",
      "/api/pp/practice-support → practice-popover/popover",
    ])
    for (const row of FORBIDDEN_SCOPE_TABLE) {
      expect(row.pattern.source.startsWith("^")).toBe(true)
      expect(row.pattern.source.endsWith("$")).toBe(true)
    }
  })
})

describe("normalizeForbiddenPath", () => {
  it.each([
    ["/api/1h/v2/user/npi/", "user/npi"],
    ["v1/user/npi#x", "user/npi"],
    ["  //api/pp/mfa/validate  ", "pp/mfa/validate"],
    ["http://localhost:3100/api/1h/v2/user/myself?x=1", "user/myself"],
  ])("%j → %j", (path, normalized) => {
    expect(normalizeForbiddenPath(path)).toBe(normalized)
  })
})
