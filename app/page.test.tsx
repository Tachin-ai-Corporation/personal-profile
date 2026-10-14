// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The home page is a server-component guard (AD-1, D1): the kill switch first
 * (disabled screen, no redirect), then `requireSession()` (→ `/auth`). Each case re-mocks the server
 * deps and reimports the page so the guard's control flow can be asserted
 * without a real request/cookie. `redirect()` throws a sentinel we can assert.
 */

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock("next/navigation", () => ({ redirect }))

const IAT = 1_800_000_000_000
const LAST_SEEN = IAT + 120_000
const SESSION = { sid: "abc", iat: IAT, lastSeen: LAST_SEEN, environment: "demo" }
const DEMO_PORTAL = "https://1health.demo.1health.io"
const PROD_PORTAL = "https://1health.app.1health.io"

async function loadPage(
  config: {
    PP_DISABLED?: boolean
    requireSession?: ReturnType<typeof vi.fn>
    getSession?: ReturnType<typeof vi.fn>
    remembered?: "demo" | "prod" | null
  } = {},
) {
  const requireSession = config.requireSession ?? vi.fn().mockResolvedValue(SESSION)
  const getSession = config.getSession ?? vi.fn().mockResolvedValue(null)
  const readEnvironmentCookie = vi.fn().mockResolvedValue(config.remembered ?? null)

  const computeBinding = vi.fn((sid: string) => `binding-for-${sid}`)

  vi.resetModules()
  vi.doMock("@/lib/server/env", () => ({ PP_DISABLED: config.PP_DISABLED ?? false }))
  vi.doMock("@/lib/server/environment-cookie", () => ({ readEnvironmentCookie }))
  vi.doMock("@/lib/server/session", () => ({
    requireSession,
    getSession,
    IDLE_TIMEOUT_MS: 15 * 60 * 1000,
    ABSOLUTE_TIMEOUT_MS: 8 * 60 * 60 * 1000,
  }))
  vi.doMock("@/lib/server/session-binding", () => ({ computeBinding }))

  const HomePage = (await import("./page")).default
  return { HomePage, requireSession, getSession, computeBinding }
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

  it("embeds the binding for the session's sid and the session environment's portal URL", async () => {
    const { HomePage, computeBinding } = await loadPage()
    const element = (await HomePage()) as { props: { sessionBinding: string; portalUrl: string } }
    expect(computeBinding).toHaveBeenCalledWith("abc")
    expect(element.props.sessionBinding).toBe("binding-for-abc")
    expect(element.props.portalUrl).toBe(DEMO_PORTAL)
  })

  it("a prod session gets the prod portal URL", async () => {
    const { HomePage } = await loadPage({ requireSession: vi.fn().mockResolvedValue({ ...SESSION, environment: "prod" }) })
    const element = (await HomePage()) as { props: { portalUrl: string } }
    expect(element.props.portalUrl).toBe(PROD_PORTAL)
  })

  it("propagates requireSession's redirect to /auth when there is no session", async () => {
    const requireSession = vi.fn().mockImplementation(() => {
      throw new Error("REDIRECT:/auth")
    })
    const { HomePage } = await loadPage({ requireSession })
    await expect(HomePage()).rejects.toThrow("REDIRECT:/auth")
  })

  it.each([
    ["the session's environment", { environment: "prod" }, "demo", "prod"],
    ["the remembered environment without a session", null, "demo", "demo"],
    ["prod with neither", null, null, null],
  ] as const)(
    "PP_DISABLED renders the disabled screen directly (no redirect, no requireSession) with %s",
    async (_label, session, remembered, expected) => {
      const { DisabledScreen } = await import("@/features/shell/disabled-screen")
      const { HomePage, requireSession } = await loadPage({
        PP_DISABLED: true,
        getSession: vi.fn().mockResolvedValue(session),
        remembered,
      })
      const element = (await HomePage()) as { type: unknown; props: Record<string, unknown> }
      expect((element.type as { name?: string }).name).toBe(DisabledScreen.name)
      expect(element.props).toEqual({ environment: expected })
      expect(requireSession).not.toHaveBeenCalled()
      expect(redirect).not.toHaveBeenCalled()
    },
  )
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
  it("mounts SessionDialogs inside ClientConfig with exactly the session portalUrl", async () => {
    const { SessionDialogs } = await import("@/features/shell/session-dialogs")
    const { HomePage } = await loadPage()
    const element = (await HomePage()) as { props: { children: unknown } }
    const children = ([] as unknown[]).concat(element.props.children) as { type: unknown; props: Record<string, unknown> }[]
    const dialogs = children.filter((child) => child && (child.type as { name?: string })?.name === SessionDialogs.name)
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0].props).toEqual({ portalUrl: DEMO_PORTAL })
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
    expect(children[1].props).toEqual({ portalUrl: DEMO_PORTAL })
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
