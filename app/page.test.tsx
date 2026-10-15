import { act, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { http } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AddressesSection } from "@/features/addresses"
import { EmailSection, PhoneSection, SocialSection } from "@/features/contacts"
import { ProfileHeader } from "@/features/header"
import { InsuranceSection } from "@/features/insurance"
import { PersonalSection } from "@/features/personal"
import { SaveAllBar } from "@/features/save-all"
import { ContactsPanel, InsurancePanel, PageFrame, PROFILE_SECTION_IDS, ProfileTabs, SAVE_ORDER, SIGNATURE_ANCHOR } from "@/features/shell"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { setTestUrl } from "@/test/next-navigation"
import { profileReadHandlers } from "@/test/page-handlers"
import { TestProviders, testIdle } from "@/test/providers"

/**
 * Team A: the `/` composition of `app/page.tsx` (spec F7-1; the server part,
 * `requirePageSession`, is covered by e2e). Asserts shell-level behaviour
 * only (landmarks, slots, one `myself` request, tab order, axe), so a story
 * that replaces a feature stub keeps this test green. The `/account`
 * composition is Team B's `app/account.test.tsx`.
 */

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

function renderProfilePage() {
  return render(
    <TestProviders>
      <PageFrame page="profile" header={<ProfileHeader />} idle={testIdle()} saveOrder={SAVE_ORDER} saveAllSlot={<SaveAllBar />}>
        <ProfileTabs
          contacts={
            <ContactsPanel
              sections={{
                personal: <PersonalSection />,
                phone: <PhoneSection />,
                email: <EmailSection />,
                social: <SocialSection />,
                addresses: <AddressesSection />,
              }}
            />
          }
          insurance={<InsurancePanel section={<InsuranceSection />} />}
        />
      </PageFrame>
    </TestProviders>,
  )
}

beforeEach(() => {
  setTestUrl("/")
  stubViewport(1280)
  stubLayoutApis()
  server.use(...profileReadHandlers())
})
afterEach(() => document.documentElement.classList.remove("dark"))

describe("/ page composition (Team A)", () => {
  it("the header and the frame share ONE myself request through the root SWR provider", async () => {
    let calls = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => {
        calls += 1
        return Response.json(myselfWire())
      }),
    )
    renderProfilePage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    expect(calls).toBe(1)
  })

  it("tab order: page nav → Return → header → tabs → Section menu; the wordmark is never focusable", async () => {
    renderProfilePage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const focusable = [...document.querySelectorAll<HTMLElement>("a[href], button, [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.closest("[hidden]"),
    )
    const names = focusable.map((el) => el.getAttribute("role") ?? el.tagName.toLowerCase()).map((role, i) => `${role}:${focusable[i].textContent}`)
    expect(names.slice(0, 3)).toEqual(["a:Personal Profile", "a:Account", "a:Return to 1health"])
    const tabIndex = names.findIndex((n) => n.startsWith("tab:"))
    expect(tabIndex).toBeGreaterThan(2)
    // Contacts takes its panel out of the Tab order: the Section menu follows the tabs (F3-3).
    const lastTab = names.findLastIndex((n) => n.startsWith("tab:"))
    expect(names[lastTab + 1]).toBe("a:01Personal information")
    expect(names.some((n) => n.startsWith("tabpanel:"))).toBe(false)
    expect(names.some((n) => n.endsWith(":1health"))).toBe(false)
    expect(window.location.search).toBe("?tab=contacts")
  })

  it("every slot is filled: one h1, the Contacts landmarks in Section order with the Signature anchor, Account not current", async () => {
    renderProfilePage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect([...document.querySelectorAll("main section[id]")].map((s) => s.id)).toEqual([...PROFILE_SECTION_IDS])
    expect(document.getElementById(SIGNATURE_ANCHOR)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Personal Profile" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("tab", { name: "Contacts" }).getAttribute("aria-selected")).toBe("true")
  })

  it("?tab=insurance: the Insurance slot is the selected panel", async () => {
    setTestUrl("/?tab=insurance")
    renderProfilePage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.getByRole("tab", { name: "Insurance" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("region", { name: "Insurance" })).toBeTruthy()
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    renderProfilePage()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
