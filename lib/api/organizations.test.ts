import { describe, expect, it } from "vitest"
import { orgLogoPath, organizationsPath, ORGS_PAGE_SIZE } from "."

/** My Organizations (Team B, Epic 10). Team B adds its own cases here. */
describe("organizations", () => {
  it("paths and constants", () => {
    expect(ORGS_PAGE_SIZE).toBe(12)
    expect(organizationsPath("a&b", 1)).toBe("/api/1h/v2/user/organization/portal?name=a%26b&page=1&size=12")
    expect(orgLogoPath(9)).toBe("/api/pp/org-logo/9")
  })
})
