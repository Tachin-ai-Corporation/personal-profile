import { act, render, screen } from "@testing-library/react"
import { http } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccountSettingsSection } from "@/features/account"
import { ProfileHeader } from "@/features/header"
import { AuthenticatorSection } from "@/features/mfa"
import { OrganizationsTab } from "@/features/organizations"
import { ProviderTab } from "@/features/provider"
import { ACCOUNT_ANCHORS, AccountPersonalPanel, AccountTabs, PageFrame } from "@/features/shell"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { setTestUrl } from "@/test/next-navigation"
import { accountReadHandlers } from "@/test/page-handlers"
import { TestProviders, testIdle } from "@/test/providers"

/**
 * Team B: the `/account` composition Story 7.1's `app/account/page.tsx` will
 * render (spec F7-1): `PageFrame page="account"` → `AccountTabs` with every
 * Team B feature entry point in its slot. Asserts shell-level behaviour only
 * (landmarks, slots, one `myself` request, tab order, axe), so a story that
 * replaces a feature stub keeps this test green. When Story 7.1 adds the page,
 * render the same tree from it here. The `/` composition is Team A's
 * `app/page.test.tsx`.
 */

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

function renderAccountPage() {
  return render(
    <TestProviders>
      <PageFrame page="account" header={<ProfileHeader />} idle={testIdle()}>
        <AccountTabs
          personal={<AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorSection />} />}
          provider={<ProviderTab />}
          organizations={<OrganizationsTab />}
        />
      </PageFrame>
    </TestProviders>,
  )
}

beforeEach(() => {
  setTestUrl("/account")
  stubViewport(1280)
  stubLayoutApis()
  server.use(...accountReadHandlers())
})

describe("/account page composition (Team B)", () => {
  it("no tab: Personal opens and the URL is normalized; Account is the current page", async () => {
    renderAccountPage()
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
    renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    expect(calls).toBe(1)
  })

  it("Personal: both landmarks the panel deep-links to, one h1, axe clean", async () => {
    setTestUrl("/account?tab=personal")
    renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    for (const id of ACCOUNT_ANCHORS) expect(document.querySelector(`main section#${id}`)).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("tab order: page nav → Return → header → the selected tab; the wordmark is never focusable", async () => {
    renderAccountPage()
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
    renderAccountPage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const selected = screen.getByRole("tab", { name: label })
    expect(selected.getAttribute("aria-selected")).toBe("true")
    const panel = document.getElementById(selected.getAttribute("aria-controls") ?? "")
    expect(panel?.hidden).toBe(false)
    expect(panel?.childElementCount).toBeGreaterThan(0)
  })
})
