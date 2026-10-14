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

const IAT = 1_800_000_000_000
const LAST_SEEN = IAT + 120_000
const SESSION = { sid: "abc", iat: IAT, lastSeen: LAST_SEEN }

async function loadPage(
  config: { PP_DISABLED?: boolean; deriveThrows?: boolean; requireSession?: ReturnType<typeof vi.fn> } = {},
) {
  const requireSession = config.requireSession ?? vi.fn().mockResolvedValue(SESSION)
  const deriveAesKey = vi.fn(() => {
    if (config.deriveThrows) throw new Error("bad key")
    return Buffer.alloc(32)
  })

  const computeBinding = vi.fn((sid: string) => `binding-for-${sid}`)

  vi.resetModules()
  vi.doMock("@/lib/server/env", () => ({
    ONEHEALTH_SECRET_KEY: "secret",
    PORTAL_URL: "https://portal.example/applications",
    PP_DISABLED: config.PP_DISABLED ?? false,
  }))
  vi.doMock("@/lib/server/launch", () => ({ deriveAesKey }))
  vi.doMock("@/lib/server/session", () => ({
    requireSession,
    IDLE_TIMEOUT_MS: 15 * 60 * 1000,
    ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000,
  }))
  vi.doMock("@/lib/server/session-binding", () => ({ computeBinding }))

  const HomePage = (await import("./page")).default
  return { HomePage, requireSession, deriveAesKey, computeBinding }
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

  it("embeds the binding for the session's sid and the portal URL", async () => {
    const { HomePage, computeBinding } = await loadPage()
    const element = (await HomePage()) as { props: { sessionBinding: string; portalUrl: string } }
    expect(computeBinding).toHaveBeenCalledWith("abc")
    expect(element.props.sessionBinding).toBe("binding-for-abc")
    expect(element.props.portalUrl).toBe("https://portal.example/applications")
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

describe("home page idle-warning props (Story 1.6)", () => {
  it("passes exactly idleTimeoutSec, lastSeen, absoluteExpiresAt and serverNow to IdleWarning", async () => {
    const { IdleWarning } = await import("@/features/shell/idle-warning")
    const { HomePage } = await loadPage()
    const before = Date.now()
    const element = (await HomePage()) as { props: { children: unknown } }
    const after = Date.now()
    const children = ([] as unknown[]).concat(element.props.children) as { type: unknown; props: Record<string, number> }[]
    const warning = children.find((child) => child && (child.type as { name?: string })?.name === IdleWarning.name)
    expect(warning).toBeTruthy()
    expect(Object.keys(warning!.props).sort()).toEqual(["absoluteExpiresAt", "idleTimeoutSec", "lastSeen", "serverNow"])
    expect(warning!.props.idleTimeoutSec).toBe(900)
    expect(warning!.props.lastSeen).toBe(LAST_SEEN)
    expect(warning!.props.absoluteExpiresAt).toBe(IAT + 8 * 60 * 60 * 1000)
    expect(warning!.props.serverNow).toBeGreaterThanOrEqual(before)
    expect(warning!.props.serverNow).toBeLessThanOrEqual(after)
  })
})
