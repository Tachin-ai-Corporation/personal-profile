// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The dev launch helper must 404 unless `APP_ENV === "dev"` (AD-20). `APP_ENV`
 * is read from `lib/server/env.ts` at load, so each case stubs the env module
 * and imports the page fresh; `notFound()` throws a sentinel we can assert.
 */

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})

vi.mock("next/navigation", () => ({ notFound }))

async function loadPage(appEnv: string) {
  vi.resetModules()
  vi.doMock("@/lib/server/env", () => ({ APP_ENV: appEnv }))
  return (await import("./page")).default
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe("dev launch page — env gate", () => {
  for (const appEnv of ["demo", "prod"]) {
    it(`calls notFound() when APP_ENV is ${appEnv}`, async () => {
      const LaunchDevPage = await loadPage(appEnv)
      expect(() => LaunchDevPage()).toThrow("NEXT_NOT_FOUND")
      expect(notFound).toHaveBeenCalledOnce()
    })
  }

  it("renders the form when APP_ENV is dev", async () => {
    const LaunchDevPage = await loadPage("dev")
    const element = LaunchDevPage()
    expect(element).toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })
})
