import { act, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProfileHeader } from "@/features/header"
import { PageFrame, ProfileTabs } from "@/features/shell"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TestProviders, testIdle } from "@/test/providers"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

/** The `/` composition from app/page.tsx (the server part, requirePageSession, is covered by e2e). */
function renderHome() {
  return render(
    <TestProviders>
      <PageFrame page="profile" header={<ProfileHeader />} idle={testIdle()}>
        <ProfileTabs />
      </PageFrame>
    </TestProviders>,
  )
}

beforeEach(() => {
  setTestUrl("/")
  stubViewport(1280)
  stubLayoutApis()
  server.use(
    http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 1, personId: 2, firstName: "Ann", lastName: "Lee" })),
    http.get("/api/1h/v2/user/contact-point/list", () => HttpResponse.json([])),
  )
})
afterEach(() => document.documentElement.classList.remove("dark"))

describe("/ page frame", () => {
  it("the header and the frame share ONE myself request through the root SWR provider", async () => {
    let calls = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => {
        calls += 1
        return HttpResponse.json({ id: 1, personId: 2, firstName: "Ann", lastName: "Lee" })
      }),
    )
    renderHome()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    expect(calls).toBe(1)
  })

  it("tab order: page nav → Return → header → tabs → Section menu; the wordmark is never focusable", async () => {
    renderHome()
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

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    renderHome()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => undefined)
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
