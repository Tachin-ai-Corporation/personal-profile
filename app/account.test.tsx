import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactElement, ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import useSWR, { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccountSettingsSection } from "@/features/account"
import { ProfileHeader } from "@/features/header"
import { AuthenticatorSection } from "@/features/mfa"
import { ProviderTab } from "@/features/provider"
import { ACCOUNT_ANCHORS, AccountPersonalPanel, AccountTabs, PageFrame, ProfileTabs, StateFrame, type FrameLevel } from "@/features/shell"
import { ApiResponseError, callApi, forbiddenScopeFor, keys, mapApiError, organizationsPath, unwrap } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { setTestUrl } from "@/test/next-navigation"
import { accountReadHandlers, profileReadHandlers } from "@/test/page-handlers"
import { TEST_PORTAL_URL, TestProviders, testIdle } from "@/test/providers"
import AccountPage, { dynamic, metadata } from "./account/page"

/**
 * Team B: the `/account` page (`app/account/page.tsx`, Story 7.1; spec F7-1).
 * Renders the route's own tree (its server part, `requirePageSession`, is
 * mocked here and covered by e2e) and asserts shell-level behaviour only
 * (landmarks, slots, lazy tabs, one `myself` request, tab order, 403 scope,
 * axe), so a story that replaces a feature stub keeps this test green. The `/`
 * composition is Team A's `app/page.test.tsx`.
 */

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
vi.mock("@/lib/server/page-session", async () => {
  const { TEST_PORTAL_URL: portalUrl, testIdle: idle } = await import("@/test/providers")
  return { requirePageSession: vi.fn(async () => ({ portalUrl, idle: idle() })) }
})

/** The tree `app/account/page.tsx` renders for a signed-in user. */
async function accountPageTree(): Promise<ReactElement> {
  return AccountPage()
}

async function renderAccountPage() {
  const page = await accountPageTree()
  return render(<TestProviders>{page}</TestProviders>)
}

const ORGS_PATH = organizationsPath("", 0)

/**
 * Test-only stand-in for Epic 10's organizations read (no `orgs` loader is
 * registered yet): reads `keys.orgs()` and renders its `StateFrame` at the
 * level the AD-23 owner table gives a 403 on that path.
 */
function OrganizationsReader() {
  const { data, error, mutate } = useSWR(keys.orgs("", 0), () => unwrap(callApi("organizations", ORGS_PATH)))
  const mapped = error instanceof ApiResponseError ? mapApiError("organizations", error.response) : undefined
  const level: FrameLevel = forbiddenScopeFor(ORGS_PATH, "account")?.level === "tab" ? "tab" : "section"
  const state = mapped ? { error: mapped } : data === undefined ? "loading" : "ready"
  return (
    <StateFrame state={state} skeleton="cards" loadError={{ kind: "page" }} level={level} onRetry={() => void mutate()}>
      <p>organizations loaded</p>
    </StateFrame>
  )
}

/** Every request MSW saw, as `pathname` (query dropped); the listener is removed after each test. */
function recordRequests(): () => string[] {
  const seen: string[] = []
  server.events.on("request:start", ({ request }) => {
    seen.push(new URL(request.url).pathname)
  })
  return () => [...seen]
}

afterEach(() => {
  server.events.removeAllListeners("request:start")
})

/** The panel controlled by the tab named `label`. */
function panelOf(label: string): HTMLElement | null {
  return document.getElementById(screen.getByRole("tab", { name: label }).getAttribute("aria-controls") ?? "")
}

const NPI = "/api/1h/v2/user/npi"
const ORGS = "/api/1h/v2/user/organization/portal"

beforeEach(() => {
  setTestUrl("/account")
  stubViewport(1280)
  stubLayoutApis()
  server.use(...accountReadHandlers())
})

describe("/account page (Team B, Story 7.1)", () => {
  it("renders per request: force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("names the browser tab Account, not the layout's Personal Profile", () => {
    expect(metadata.title).toBe("Account")
  })

  it("no tab: Personal opens and the URL is normalized; Account is the current page", async () => {
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(window.location.search).toBe("?tab=personal")
    expect(screen.getByRole("tab", { name: "Personal Account" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("aria-current")).toBe("page")
  })

  it("the header and the frame share ONE myself request through the root SWR provider", async () => {
    let calls = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => {
        calls += 1
        return Response.json(myselfWire())
      }),
    )
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    expect(calls).toBe(1)
  })

  it("Personal: both landmarks the panel deep-links to, one h1, no Save all, axe clean", async () => {
    setTestUrl("/account?tab=personal")
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    for (const id of ACCOUNT_ANCHORS) expect(document.querySelector(`main section#${id}`)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /save all/i })).toBeNull()
    expect(await axeViolations()).toEqual([])
  })

  it("tab order: page nav → Return → header → the selected tab; the wordmark is never focusable", async () => {
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const focusable = [...document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.closest("[hidden]"),
    )
    const names = focusable.map((el) => `${el.getAttribute("role") ?? el.tagName.toLowerCase()}:${el.textContent}`)
    expect(names.slice(0, 3)).toEqual(["a:Personal Profile", "a:Account", "a:Return to 1health"])
    expect(names.findIndex((n) => n.startsWith("tab:"))).toBeGreaterThan(2)
    expect(names.some((n) => n.endsWith(":1health"))).toBe(false)
  })

  it.each([
    ["provider", "Individual Provider Registration"],
    ["organizations", "My Organizations"],
  ])("?tab=%s: its slot is the selected, non-empty panel", async (tab, label) => {
    setTestUrl(`/account?tab=${tab}`)
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const selected = screen.getByRole("tab", { name: label })
    expect(selected.getAttribute("aria-selected")).toBe("true")
    const panel = panelOf(label)
    expect(panel?.hidden).toBe(false)
    expect(panel?.childElementCount).toBeGreaterThan(0)
  })

  it("lazy tabs (PNFR3): ?tab=personal mounts only Personal and reads no NPI or organizations; opening a tab mounts only that tab", async () => {
    const requests = recordRequests()
    setTestUrl("/account?tab=personal")
    await renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    expect(requests().filter((path) => path === NPI || path === ORGS)).toEqual([])
    expect(panelOf("Personal Account")?.childElementCount).toBeGreaterThan(0)
    expect(panelOf("Individual Provider Registration")?.childElementCount).toBe(0)
    expect(panelOf("My Organizations")?.childElementCount).toBe(0)

    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Individual Provider Registration" }), { button: 0 }))
    expect(window.location.search).toBe("?tab=provider")
    await screen.findByRole("heading", { name: "Healthcare credentials" })
    await waitFor(() => expect(requests().filter((path) => path === NPI)).toHaveLength(1))
    expect(panelOf("Individual Provider Registration")?.childElementCount).toBeGreaterThan(0)
    expect(panelOf("Personal Account")?.childElementCount).toBe(0)
    expect(panelOf("My Organizations")?.childElementCount).toBe(0)
    expect(document.querySelector("main section#account")).toBeNull()
  })

  it("an upstream 403 on the organizations read shows the tab-level no-access panel; Personal Account keeps working (PNFR11, AD-23)", async () => {
    let orgReads = 0
    server.use(
      http.get(ORGS, () => {
        orgReads += 1
        return HttpResponse.json({ message: "Forbidden", code: 403 }, { status: 403 })
      }),
    )
    setTestUrl("/account?tab=organizations")
    render(
      <TestProviders>
        <PageFrame page="account" header={<ProfileHeader />} idle={testIdle()}>
          <AccountTabs
            personal={<AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorSection />} />}
            provider={<ProviderTab />}
            organizations={<OrganizationsReader />}
          />
        </PageFrame>
      </TestProviders>,
    )
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const noAccess = await screen.findByText("You don't have access to this in your current account")
    expect(noAccess.closest("[data-slot='no-access']")?.getAttribute("data-level")).toBe("tab")
    expect(panelOf("My Organizations")?.contains(noAccess)).toBe(true)
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
    expect(orgReads).toBe(1)

    // Personal Account is unaffected: it opens with both landmarks and no error.
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Personal Account" }), { button: 0 }))
    for (const id of ACCOUNT_ANCHORS) expect(document.querySelector(`main section#${id}`)).toBeTruthy()
    expect(screen.queryByText("You don't have access to this in your current account")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("/ → Account → Personal Profile shares one cache: one myself request while it is fresh (PNFR3)", async () => {
    server.use(...profileReadHandlers(), ...accountReadHandlers())
    let calls = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => {
        calls += 1
        return Response.json(myselfWire())
      }),
    )
    const accountTree = await accountPageTree()
    const profileTree = (
      <PageFrame page="profile" header={<ProfileHeader />} idle={testIdle()}>
        <ProfileTabs />
      </PageFrame>
    )
    /** Picks the route by pathname, as the App Router would, under one root SWR cache. */
    function Router(): ReactNode {
      const pathname = useUrl()
      return pathname.startsWith("/account") ? accountTree : profileTree
    }
    setTestUrl("/")
    render(
      <TestProviders>
        {/* SWR's own deduping window (TestProviders turns it off): "fresh" as in production. */}
        <SWRConfig value={{ dedupingInterval: 2000 }}>
          <Router />
        </SWRConfig>
      </TestProviders>,
    )
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.getByRole("link", { name: "Personal Profile" }).getAttribute("aria-current")).toBe("page")

    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Account" })))
    expect(window.location.pathname).toBe("/account")
    await screen.findByRole("tab", { name: "Personal Account" })
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Personal Profile" })))
    expect(window.location.pathname).toBe("/")
    await screen.findByRole("tab", { name: "Contacts" })
    await act(async () => undefined)
    expect(calls).toBe(1)
  })

  it("the server part embeds the session's portal URL", async () => {
    const page = (await accountPageTree()) as ReactElement<{ portalUrl: string }>
    expect(page.props.portalUrl).toBe(TEST_PORTAL_URL)
  })
})

/** The current pathname, re-read on every history change (the test router pushes with `pushState`). */
function useUrl(): string {
  // The mocked `useSearchParams` re-renders on every push/replace; the pathname changes with it.
  useSearchParams()
  return window.location.pathname
}
