import { describe, expect, it } from "vitest"
import { FORBIDDEN_SCOPE_TABLE, forbiddenScopeFor, normalizeForbiddenPath, type ForbiddenPage, type ForbiddenScope } from "@/lib/api"

/** The AD-23 403 owner table (epics Story 7.1 / FR103), row by row. */
describe("forbiddenScopeFor: the AD-23 owner table", () => {
  it.each<[string, ForbiddenPage, ForbiddenScope]>([
    ["v2/user/contact-point/list", "account", { owner: "account-pickers", level: "control" }],
    ["/api/1h/v2/user/contact-point/list?type=Email", "account", { owner: "account-pickers", level: "control" }],
    // On `/` the same endpoint belongs to the Contacts Section that asked for that type.
    ["/api/1h/v2/user/contact-point/list?type=Mobile", "profile", { owner: "phone", level: "section" }],
    ["/api/1h/v2/user/contact-point/list?type=Landline", "profile", { owner: "phone", level: "section" }],
    ["/api/1h/v2/user/contact-point/list?type=Email", "profile", { owner: "email", level: "section" }],
    ["/api/1h/v2/user/contact-point/list?type=Social%20Media", "profile", { owner: "social", level: "section" }],
    ["/api/1h/v2/person/location/list?page=0&size=100", "profile", { owner: "addresses", level: "section" }],
    ["/api/1h/v2/health/patient/insurance?page=0&size=100", "profile", { owner: "insurance", level: "section" }],
    ["v2/mfa/enable/totp", "account", { owner: "authenticator", level: "section" }],
    ["v2/mfa/disable/totp", "account", { owner: "authenticator", level: "section" }],
    ["/api/1h/v2/mfa/config", "account", { owner: "authenticator", level: "section" }],
    ["/api/pp/mfa/validate", "account", { owner: "authenticator", level: "section" }],
    ["v2/user/npi", "account", { owner: "provider", level: "tab" }],
    ["/api/1h/v2/public/npi/list?entityTypeCode=1&limit=10", "account", { owner: "provider", level: "tab" }],
    ["v2/user/register/npi", "account", { owner: "provider", level: "tab" }],
    ["/api/1h/v2/health/npi/5/is-registered", "account", { owner: "provider", level: "tab" }],
    ["v2/user/organization/portal?size=12&page=0", "account", { owner: "organizations", level: "tab" }],
    ["/api/pp/practice-support", "account", { owner: "practice-popover", level: "popover" }],
    ["https://app.example.test/api/pp/practice-support?tenantId=9", "account", { owner: "practice-popover", level: "popover" }],
  ])("%s on %s → %j", (path, page, scope) => {
    expect(forbiddenScopeFor(path, page)).toEqual(scope)
  })

  it.each(["v2/person/location/list", "v2/health/patient/insurance"])("%j is a / Section's row only (no owner on /account)", (path) => {
    expect(forbiddenScopeFor(path, "account")).toBeNull()
  })

  it("the owners don't depend on the page outside contact-point/list", () => {
    for (const path of ["v2/mfa/config", "v2/user/npi", "v2/user/organization/portal", "/api/pp/practice-support"]) {
      expect(forbiddenScopeFor(path, "profile")).toEqual(forbiddenScopeFor(path, "account"))
    }
  })

  it.each([
    "v2/user/myself",
    "v2/user/edit",
    "v2/mfa",
    "v2/user/npi/extra",
    "v2/health/npi/me/is-registered",
    "v2/health/npi/5/is-registered/x",
    "/api/pp/profile-picture-id",
    "/api/pp/org-logo/7",
    "user/contact-point/list/x",
    "v2/person/location/7",
    "v2/health/patient/insurance/7",
    "",
  ])("%j has no owner (the surface that read it decides)", (path) => {
    expect(forbiddenScopeFor(path, "account")).toBeNull()
    expect(forbiddenScopeFor(path, "profile")).toBeNull()
  })

  it.each(["v2/user/contact-point/list", "v2/user/contact-point/list?type=Bogus"])("%j on / has no owner without a known type", (path) => {
    expect(forbiddenScopeFor(path, "profile")).toBeNull()
  })

  it("covers every row of the published table, in order", () => {
    expect(FORBIDDEN_SCOPE_TABLE.map((row) => `${row.endpoint}${row.page ? ` on ${row.page}` : ""} → ${row.owner}/${row.level}`)).toEqual([
      "contact-point/list?type=Mobile on profile → phone/section",
      "contact-point/list?type=Landline on profile → phone/section",
      "contact-point/list?type=Email on profile → email/section",
      "contact-point/list?type=Social Media on profile → social/section",
      "contact-point/list on account → account-pickers/control",
      "person/location/list on profile → addresses/section",
      "health/patient/insurance on profile → insurance/section",
      "mfa/* → authenticator/section",
      "/api/pp/mfa/validate → authenticator/section",
      "user/npi → provider/tab",
      "public/npi/list → provider/tab",
      "user/register/npi → provider/tab",
      "health/npi/{n}/is-registered → provider/tab",
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
