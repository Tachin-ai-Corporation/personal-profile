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
  it("renders the shell when a session exists", async () => {
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

describe("home page session dialogs (Story 1.7)", () => {
  it("mounts SessionDialogs inside ClientConfig with exactly portalUrl = PORTAL_URL", async () => {
    const { SessionDialogs } = await import("@/features/shell/session-dialogs")
    const { HomePage } = await loadPage()
    const element = (await HomePage()) as { props: { children: unknown } }
    const children = ([] as unknown[]).concat(element.props.children) as { type: unknown; props: Record<string, unknown> }[]
    const dialogs = children.filter((child) => child && (child.type as { name?: string })?.name === SessionDialogs.name)
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0].props).toEqual({ portalUrl: "https://portal.example/applications" })
    // It must subscribe before any publisher mounts: first child, before IdleWarning.
    const { IdleWarning } = await import("@/features/shell/idle-warning")
    const names = children.map((child) => (child?.type as { name?: string } | undefined)?.name)
    expect(names[0]).toBe(SessionDialogs.name)
    expect(names.indexOf(SessionDialogs.name)).toBeLessThan(names.indexOf(IdleWarning.name))
  })
})

type Node = { type: unknown; props: Record<string, unknown> }

function childrenOf(element: unknown): Node[] {
  return ([] as unknown[]).concat((element as { props: { children: unknown } }).props.children).filter(Boolean) as Node[]
}

function typeName(node: Node): string | undefined {
  return typeof node.type === "string" ? node.type : (node.type as { name?: string } | undefined)?.name
}

describe("home page shell (Story 1.8)", () => {
  it("renders SessionDialogs, AppBar, main, IdleWarning in that order inside ClientConfig", async () => {
    const { SessionDialogs } = await import("@/features/shell/session-dialogs")
    const { AppBar } = await import("@/features/shell/app-bar")
    const { IdleWarning } = await import("@/features/shell/idle-warning")
    const { HomePage } = await loadPage()
    const children = childrenOf(await HomePage())
    expect(children.map(typeName)).toEqual([SessionDialogs.name, AppBar.name, "main", IdleWarning.name])
    expect(children[1].props).toEqual({ portalUrl: "https://portal.example/applications" })
  })

  it("puts the header slot (single h1) before the tabbed shell inside main", async () => {
    const { ProfileTabs } = await import("@/features/shell/profile-tabs")
    const { HomePage } = await loadPage()
    const main = childrenOf(await HomePage())[2]
    const inner = childrenOf(main)
    expect(inner.map(typeName)).toEqual(["section", ProfileTabs.name])
    expect(inner[0].props["aria-label"]).toBe("Profile")
    const header = childrenOf(inner[0])
    expect(header.filter((n) => n.type === "h1")).toHaveLength(1)
  })

  async function initialTabFor(searchParams: Record<string, string | string[] | undefined> | undefined) {
    const { ProfileTabs } = await import("@/features/shell/profile-tabs")
    const { HomePage } = await loadPage()
    const element = await HomePage(searchParams === undefined ? undefined : { searchParams: Promise.resolve(searchParams) })
    const tabs = childrenOf(childrenOf(element)[2]).find((n) => typeName(n) === ProfileTabs.name)
    return tabs?.props.initialTab
  }

  it("opens the tab named by ?tab=", async () => {
    expect(await initialTabFor({ tab: "contacts" })).toBe("contacts")
    expect(await initialTabFor({ tab: "insurance" })).toBe("insurance")
    expect(await initialTabFor({ tab: "medical" })).toBe("medical")
  })

  it("falls back to contacts for a missing, unknown or repeated ?tab=", async () => {
    expect(await initialTabFor({})).toBe("contacts")
    expect(await initialTabFor(undefined)).toBe("contacts")
    expect(await initialTabFor({ tab: "foo" })).toBe("contacts")
    expect(await initialTabFor({ tab: "__proto__" })).toBe("contacts")
    expect(await initialTabFor({ tab: ["insurance", "medical"] })).toBe("contacts")
  })
})
