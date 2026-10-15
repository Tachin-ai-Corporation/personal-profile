import { describe, expect, it } from "vitest"
import { NPI_PAGE_SIZE, NPI_SEARCH_MAX_LENGTH, npiIsRegisteredPath, personalNpiSearchPath, practiceNpiSearchPath, registerNpiPath, userNpiPath } from "."

/** Provider registration (Team B, Epic 9). Team B adds its own cases here. */
describe("npi", () => {
  it("paths and constants", () => {
    expect(NPI_PAGE_SIZE).toBe(10)
    expect(NPI_SEARCH_MAX_LENGTH).toBe(100)
    expect(personalNpiSearchPath("ann lee", 0)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=1&searchText=ann+lee&page=0&limit=10")
    expect(practiceNpiSearchPath("", 3)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=2&searchText=&page=3&limit=10")
    expect(userNpiPath()).toBe("/api/1h/v2/user/npi")
    expect(npiIsRegisteredPath(77)).toBe("/api/1h/v2/health/npi/77/is-registered")
    expect(registerNpiPath()).toBe("/api/1h/v2/user/register/npi")
  })
})
