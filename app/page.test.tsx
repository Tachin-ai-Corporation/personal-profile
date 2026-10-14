// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The home page is a server-component guard (AD-1, AD-4): kill-switch and
 * bad-key checks first, then `requireSession()`. Each case re-mocks the server
 * deps and reimports the page so the guard's control flow can be asserted
 * without a real request/cookie. `redirect()` throws a sentinel we can assert.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock("next/navigation", () => ({ redirect }))

async function loadPage(
  config: { PP_DISABLED?: boolean; deriveThrows?: boolean; requireSession?: ReturnType<typeof vi.fn> } = {},
) {
  const requireSession = config.requireSession ?? vi.fn().mockResolvedValue({ sid: "abc" })
  const deriveAesKey = vi.fn(() => {
    if (config.deriveThrows) throw new Error("bad key")
    return Buffer.alloc(32)
  })

  vi.resetModules()
  vi.doMock("@/lib/server/env", () => ({ ONEHEALTH_SECRET_KEY: "secret", PP_DISABLED: config.PP_DISABLED ?? false }))
  vi.doMock("@/lib/server/launch", () => ({ deriveAesKey }))
  vi.doMock("@/lib/server/session", () => ({ requireSession }))

  const HomePage = (await import("./page")).default
  return { HomePage, requireSession, deriveAesKey }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe("home page guard", () => {
  it("renders the placeholder when a session exists", async () => {
    const { HomePage, requireSession } = await loadPage()
    const element = await HomePage()
    expect(element).toBeTruthy()
    expect(requireSession).toHaveBeenCalledOnce()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("redirects to the session-expired screen when there is no session", async () => {
    const requireSession = vi.fn().mockImplementation(() => {
      throw new Error("REDIRECT:/launch-error?reason=expired")
    })
    const { HomePage } = await loadPage({ requireSession })
    await expect(HomePage()).rejects.toThrow("REDIRECT:/launch-error?reason=expired")
  })

  it("redirects to reason=disabled when PP_DISABLED is set, without reaching requireSession", async () => {
    const { HomePage, requireSession } = await loadPage({ PP_DISABLED: true })
    await expect(HomePage()).rejects.toThrow("REDIRECT:/launch-error?reason=disabled")
    expect(requireSession).not.toHaveBeenCalled()
  })

  it("redirects to reason=config when the key cannot be derived", async () => {
    const { HomePage, requireSession } = await loadPage({ deriveThrows: true })
    await expect(HomePage()).rejects.toThrow("REDIRECT:/launch-error?reason=config")
    expect(requireSession).not.toHaveBeenCalled()
  })
})
