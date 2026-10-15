import { act, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { axeViolations } from "@/test/axe"
import { installDomStubs, type DomStubs } from "@/test/dom-stubs"
import { server } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TestProviders, testIdle } from "@/test/providers"
import { AccountTabs } from "./account-tabs"
import { AccountPersonalPanel } from "./anchored-panel"
import { sectionHeadingId } from "./anchors"
import { ContactsPanel } from "./contacts-panel"
import { InsurancePanel } from "./insurance-panel"
import { resetLeaveState } from "./leave"
import { CurrentPageProvider } from "./navigate"
import { PageFrame } from "./page-frame"
import { PageTabs } from "./page-tabs"
import { ACCOUNT_TAB_DEFINITIONS, PROFILE_TAB_DEFINITIONS, type PageTabDefinition } from "./page-tabs-config"
import { AccountTabPlaceholder } from "./placeholders"
import { ProfileTabs } from "./profile-tabs"
import { SAVE_ORDER } from "./save-order"
import { useSectionFrame } from "./section-frame"
import { SectionLandmark } from "./section-landmark"
import { SectionRegistryProvider } from "./section-registry"
import { StateFrame, type FrameState } from "./state-frame"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

/**
 * F6-1 page composition: generic `PageTabs` (config + panels, repeated
 * `?tab=`), the `/` and `/account` presets with their slots and
 * placeholders, the Section-ready signal (`useSectionFrame`), the
 * `/account` anchored panel, `PageFrame myselfLoadError`, `SAVE_ORDER`.
 */

let stubs: DomStubs

beforeEach(() => {
  resetLeaveState()
  stubs = installDomStubs()
})
afterEach(() => {
  stubs.uninstall()
  document.documentElement.classList.remove("dark")
})

const url = () => `${window.location.pathname}${window.location.search}${window.location.hash}`
const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent

function onPage(page: "profile" | "account", children: React.ReactNode) {
  return render(
    <TestProviders>
      <CurrentPageProvider value={page}>
        <SectionRegistryProvider>
          <main>{children}</main>
        </SectionRegistryProvider>
      </CurrentPageProvider>
    </TestProviders>,
  )
}

describe("PageTabs (generic, prop-driven)", () => {
  const TABS: readonly PageTabDefinition<"personal" | "provider">[] = [
    { id: "personal", label: "First" },
    { id: "provider", label: "Second", comingSoon: true, bare: true },
  ]
  const panels = { personal: <p>First panel</p>, provider: <p>Second panel</p> }

  it("renders the given tabs, labels, tag, panels and accessible name; knows no page", () => {
    setTestUrl("/account?view=provider")
    onPage("account", <PageTabs page="account" tabs={TABS} panels={panels} defaultTab="personal" param="view" aria-label="Sections of this page" />)
    expect(screen.getByRole("tablist", { name: "Sections of this page" })).toBeTruthy()
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["First", "SecondComing soonSoon"])
    expect(screen.getByText("Second panel")).toBeTruthy()
    expect(screen.queryByText("First panel")).toBeNull()
    const panel = document.getElementById(screen.getAllByRole("tab")[1].getAttribute("aria-controls") ?? "")
    expect(panel?.classList.contains("px-4")).toBe(false)
  })

  it("a custom param is read, normalized and changed through navigate()", async () => {
    setTestUrl("/account?view=bogus&tab=keep")
    onPage("account", <PageTabs page="account" tabs={TABS} panels={panels} defaultTab="personal" param="view" />)
    expect(url()).toBe("/account?view=personal&tab=keep")
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: /^Second/ }), { button: 0 }))
    expect(url()).toBe("/account?view=provider&tab=keep")
    expect(screen.getByText("Second panel")).toBeTruthy()
  })

  it("a tab id that isn't one of the page's typed tabs does not navigate", async () => {
    setTestUrl("/?tab=contacts")
    const odd = [
      { id: "contacts", label: "Contacts" },
      { id: "odd", label: "Odd" },
    ] as const satisfies readonly PageTabDefinition<string>[]
    onPage("profile", <PageTabs page="profile" tabs={odd} panels={{ contacts: <p>c</p>, odd: <p>o</p> }} defaultTab="contacts" />)
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Odd" }), { button: 0 }))
    expect(url()).toBe("/?tab=contacts")
    expect(selected()).toBe("Contacts")
  })

  it.each([
    ["/?tab=insurance&tab=medical", "/?tab=contacts"],
    ["/?tab=insurance&tab=insurance", "/?tab=contacts"],
    ["/?x=1&tab=contacts&tab=bogus#phone", "/?x=1&tab=contacts#phone"],
  ])("/ repeated ?tab= %s opens the default and normalizes to %s (replace)", (from, to) => {
    setTestUrl(from)
    const before = window.history.length
    onPage("profile", <ProfileTabs />)
    expect(url()).toBe(to)
    expect(window.history.length).toBe(before)
    expect(selected()).toBe("Contacts")
  })

  it.each([
    ["/account?tab=personal&tab=x", "/account?tab=personal", "Personal Account"],
    ["/account?tab=PERSONAL", "/account?tab=personal", "Personal Account"],
    ["/account?tab=mfa", "/account?tab=personal", "Personal Account"],
    ["/account", "/account?tab=personal", "Personal Account"],
    ["/account?tab=organizations", "/account?tab=organizations", "My Organizations"],
  ])("/account %s → %s (Story 7.1)", (from, to, tab) => {
    setTestUrl(from)
    onPage("account", <AccountTabs />)
    expect(url()).toBe(to)
    expect(selected()).toBe(tab)
  })
})

describe("presets and slots", () => {
  it("PROFILE_TAB_DEFINITIONS / ACCOUNT_TAB_DEFINITIONS are the page configs", () => {
    expect(PROFILE_TAB_DEFINITIONS.map((t) => [t.id, t.label, Boolean(t.comingSoon), Boolean(t.bare)])).toEqual([
      ["contacts", "Contacts", false, true],
      ["insurance", "Insurance", false, false],
      ["medical", "Medical", true, false],
    ])
    expect(ACCOUNT_TAB_DEFINITIONS.map((t) => t.label)).toEqual(["Personal Account", "Individual Provider Registration", "My Organizations"])
  })

  it("ProfileTabs renders the composed panels instead of the placeholders", () => {
    setTestUrl("/?tab=medical")
    onPage("profile", <ProfileTabs contacts={<p>my contacts</p>} insurance={<p>my insurance</p>} medical={<p>my medical</p>} />)
    expect(screen.getByText("my medical")).toBeTruthy()
  })

  it("ContactsPanel puts a composed Section in its slot and placeholders in the others, in menu order", () => {
    setTestUrl("/?tab=contacts")
    onPage(
      "profile",
      <ContactsPanel
        sections={{
          phone: (
            <SectionLandmark id="phone" title="Phone">
              <p>real phones</p>
            </SectionLandmark>
          ),
        }}
      />,
    )
    expect(screen.getByText("real phones")).toBeTruthy()
    const ids = [...document.querySelectorAll("section")].map((s) => s.id)
    expect(ids).toEqual(["personal", "phone", "email", "social", "addresses"])
    expect(document.querySelectorAll('[data-slot="state-frame"]')).toHaveLength(4)
    expect(document.getElementById("signature")).toBeTruthy()
  })

  it("InsurancePanel takes its Section, else the placeholder", () => {
    const { unmount } = onPage("profile", <InsurancePanel section={<p>policies</p>} />)
    expect(screen.getByText("policies")).toBeTruthy()
    unmount()
    onPage("profile", <InsurancePanel />)
    expect(screen.getByRole("heading", { level: 2, name: "Insurance" })).toBeTruthy()
    expect(document.querySelector('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("loading")
  })

  it("AccountTabs: Personal Account holds the account Section then the authenticator card; the others their tab skeletons", async () => {
    setTestUrl("/account?tab=personal")
    onPage("account", <AccountTabs />)
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Personal account settings", "Authenticator app"])
    expect(document.querySelector("#account [data-slot='frame-skeleton']")?.getAttribute("data-variant")).toBe("kv")
    expect(document.querySelector("#authenticator [data-slot='frame-skeleton']")?.getAttribute("data-variant")).toBe("tiles")
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: "Individual Provider Registration" }), { button: 0 }))
    expect(document.querySelector("[data-slot='frame-skeleton']")?.getAttribute("data-variant")).toBe("bars")
    expect(document.querySelector("[data-slot='frame-skeleton'] [data-slot='skeleton']")?.classList.contains("max-w-[720px]")).toBe(true)
    await act(async () => fireEvent.mouseDown(screen.getByRole("tab", { name: "My Organizations" }), { button: 0 }))
    expect(document.querySelector("[data-slot='frame-skeleton']")?.getAttribute("data-variant")).toBe("cards")
    expect(window.location.search).toBe("?tab=organizations")
  })

  it("AccountTabs renders the composed panels", () => {
    setTestUrl("/account?tab=provider")
    onPage("account", <AccountTabs personal={<p>p</p>} provider={<p>my provider</p>} organizations={<p>o</p>} />)
    expect(screen.getByText("my provider")).toBeTruthy()
  })

  it("AccountTabPlaceholder is a tab-level loading frame", () => {
    render(<AccountTabPlaceholder tab="organizations" />)
    const frame = document.querySelector('[data-slot="state-frame"]')
    expect(frame?.getAttribute("data-level")).toBe("tab")
    expect(frame?.getAttribute("aria-busy")).toBe("true")
  })

  it("SAVE_ORDER is personal → email → phone → social → addresses (AD-8)", () => {
    expect(SAVE_ORDER).toEqual(["personal", "email", "phone", "social", "addresses"])
  })
})

/** A composed Section that loads, then is ready, reporting through `useSectionFrame`. */
function LoadingSection({ id, title }: { readonly id: "phone" | "authenticator"; readonly title: string }) {
  const { onReady } = useSectionFrame(id)
  const [state, setState] = useState<FrameState>("loading")
  return (
    <SectionLandmark id={id} title={title}>
      <button type="button" onClick={() => setState("ready")}>
        load {id}
      </button>
      <StateFrame state={state} skeleton="kv" loadError={{ kind: "page" }} level="section" onRetry={vi.fn()} onReady={onReady}>
        <p>{id} content</p>
      </StateFrame>
    </SectionLandmark>
  )
}

const scrolled = () => stubs.scrolls.map((s) => (s.el as HTMLElement).id)

describe("the Section-ready signal (useSectionFrame)", () => {
  it("a deep-linked Contacts Section re-scrolls once when its own frame becomes ready", () => {
    setTestUrl("/?tab=contacts#phone")
    onPage("profile", <ContactsPanel sections={{ phone: <LoadingSection id="phone" title="Phone" /> }} />)
    expect(scrolled()).toEqual(["phone"])
    fireEvent.click(screen.getByRole("button", { name: "load phone" }))
    expect(scrolled()).toEqual(["phone", "phone"])
    expect(screen.getByText("phone content")).toBeTruthy()
  })

  it("/account: #authenticator scrolls, focuses its h2 and re-scrolls when the composed card is ready", () => {
    setTestUrl("/account?tab=personal#authenticator")
    onPage("account", <AccountTabs personal={<AccountPersonalPanel authenticator={<LoadingSection id="authenticator" title="Authenticator app" />} />} />)
    expect(scrolled()).toEqual(["authenticator"])
    expect(document.activeElement).toBe(document.getElementById(sectionHeadingId("authenticator")))
    fireEvent.click(screen.getByRole("button", { name: "load authenticator" }))
    expect(scrolled()).toEqual(["authenticator", "authenticator"])
  })

  it("outside a provider onReady does nothing", () => {
    render(<LoadingSection id="phone" title="Phone" />)
    fireEvent.click(screen.getByRole("button", { name: "load phone" }))
    expect(scrolled()).toEqual([])
  })
})

describe("PageFrame myselfLoadError (F6-1)", () => {
  const LOAD_ERROR = "Something went wrong while loading profile information"

  it.each([
    ["page", 1],
    ["sections", 0],
  ] as const)("%s: %i page-level banner(s) for a failed myself", async (mode, count) => {
    setTestUrl("/account?tab=personal")
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    render(
      <TestProviders>
        <PageFrame page="account" header={<div />} idle={testIdle()} myselfLoadError={mode}>
          <AccountTabs />
        </PageFrame>
      </TestProviders>,
    )
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryAllByText(LOAD_ERROR)).toHaveLength(count)
  })
})

describe("accessibility", () => {
  it.each(["light", "dark"])("/account tabs with placeholders: no axe violations (%s)", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    setTestUrl("/account?tab=personal")
    onPage("account", <AccountTabs />)
    expect(await axeViolations()).toEqual([])
  })

  it.each(["provider", "organizations"])("/account ?tab=%s placeholder: no axe violations", async (tab) => {
    setTestUrl(`/account?tab=${tab}`)
    onPage("account", <AccountTabs />)
    expect(await axeViolations()).toEqual([])
  })
})
