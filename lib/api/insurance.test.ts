import { describe, expect, it } from "vitest"
import { INSURANCE_CARD_RELATIONS, INSURANCE_TYPE_KEY, insuranceCardUploadPath, insuranceListPath, INSURER_PAGE_SIZE } from "."

/** Insurance (Team A, Epic 5). Team A adds its own cases here. */
describe("insurance", () => {
  it("paths and constants", () => {
    expect(INSURANCE_TYPE_KEY).toBe("Insurance")
    expect(INSURER_PAGE_SIZE).toBe(20)
    expect(insuranceListPath()).toBe("/api/1h/v2/health/patient/insurance?page=0&size=100")
    expect(insuranceCardUploadPath(55, "back")).toBe(`/api/1h/v2/health/type/Insurance/55/relation/${INSURANCE_CARD_RELATIONS.back}/file/upload`)
  })
})
