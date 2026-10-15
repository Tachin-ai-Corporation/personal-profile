import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stubLayoutApis } from "@/test/dom-stubs"
import { server, trackAllRequests } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TestProviders } from "@/test/providers"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import { resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import { CurrentPageProvider } from "./navigate"
import { ProfileTabs } from "./profile-tabs"
import { SectionRegistryProvider } from "./section-registry"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

function setup(withFixture = false) {
  return render(
    <TestProviders>
      <CurrentPageProvider value="profile">
        <SectionRegistryProvider>
          {withFixture ? <FixtureParticipant id="phone" label="Fixture phone" displayOrder={2} /> : null}
          <main>
            <ProfileTabs />
          </main>
          <LeaveGuard />
        </SectionRegistryProvider>
      </CurrentPageProvider>
    </TestProviders>,
  )
}

// `hidden: true`: a modal dialog hides the page from the accessibility tree.
const tab = (name: RegExp | string) => screen.getByRole("tab", { name, hidden: true })
const selected = () => screen.getAllByRole("tab", { hidden: true }).find((t) => t.getAttribute("aria-selected") === "true")?.textContent
const MEDICAL = /^Medical/

/** Radix moves roving focus one task after the keydown. */
async function press(target: HTMLElement, key: string): Promise<void> {
  fireEvent.keyDown(target, { key })
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

beforeEach(() => {
  resetLeaveState()
  setTestUrl("/?tab=contacts")
  // The Contacts panel's deep links scroll (jsdom has no layout).
  stubLayoutApis()
})
afterEach(() => document.documentElement.classList.remove("dark"))

describe("ProfileTabs", () => {
  it("renders Contacts / Insurance / Medical as ARIA tabs linked to panels", () => {
    setup()
    expect(screen.getByRole("tablist")).toBeTruthy()
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((t) => t.textContent)).toEqual(["Contacts", "Insurance", "MedicalComing soonSoon"])
    for (const t of tabs) {
      const panel = document.getElementById(t.getAttribute("aria-controls") ?? "")
      expect(panel?.getAttribute("role")).toBe("tabpanel")
      expect(panel?.getAttribute("aria-labelledby")).toBe(t.id)
      expect(t.className).toContain("h-11")
    }
    expect(selected()).toBe("Contacts")
    expect(tab("Contacts").className).toContain("data-[state=active]:border-primary")
  })

  it("tags Medical Coming soon (Soon below 768 px)", () => {
    setup()
    expect(tab(MEDICAL).querySelector(".max-md\\:hidden")?.textContent).toBe("Coming soon")
    expect(tab(MEDICAL).querySelector(".md\\:hidden")?.textContent).toBe("Soon")
  })

  it.each([
    ["/", "/?tab=contacts"],
    ["/?tab=bogus", "/?tab=contacts"],
    ["/?tab=bogus#phone", "/?tab=contacts#phone"],
    ["/?x=1&tab=bogus&y=2", "/?x=1&tab=contacts&y=2"],
    ["/?x=1", "/?x=1&tab=contacts"],
  ])("normalizes %s to %s with a replace", (url, expected) => {
    setTestUrl(url)
    const before = window.history.length
    setup()
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(expected)
    expect(window.history.length).toBe(before)
    expect(selected()).toBe("Contacts")
  })

  it.each([
    ["insurance", "Insurance"],
    ["medical", MEDICAL],
  ] as const)("?tab=%s: the panel stays in the Tab order (Radix tabindex=0) with the px-4 py-6 md:px-6 gutters", (value, name) => {
    setTestUrl(`/?tab=${value}`)
    setup()
    const panel = document.getElementById(tab(name).getAttribute("aria-controls") ?? "")
    expect(panel?.getAttribute("tabindex")).toBe("0")
    for (const cls of ["px-4", "py-6", "md:px-6"]) expect(panel?.classList.contains(cls)).toBe(true)
  })

  it("?tab=contacts: the bare panel is out of the Tab order (tabindex=-1) with no gutters", () => {
    setTestUrl("/?tab=contacts")
    setup()
    const panel = document.getElementById(tab("Contacts").getAttribute("aria-controls") ?? "")
    expect(panel?.getAttribute("tabindex")).toBe("-1")
    for (const cls of ["px-4", "py-6", "md:px-6"]) expect(panel?.classList.contains(cls)).toBe(false)
  })

  it("reopens the tab named in the URL", () => {
    setTestUrl("/?tab=insurance")
    setup()
    expect(selected()).toBe("Insurance")
  })

  // Ported from origin/main's profile-tabs.test.tsx (spec R5-2).
  it("Tab enters on the selected tab only (roving tabindex)", async () => {
    setTestUrl("/?tab=insurance")
    setup()
    // No tab is a tab stop of its own; the tablist is, and hands focus to the selected tab.
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "-1", "-1"])
    expect(screen.getByRole("tablist").getAttribute("tabindex")).toBe("0")
    await act(async () => screen.getByRole("tablist").focus())
    expect(document.activeElement).toBe(tab("Insurance"))
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"])
    await press(tab("Insurance"), "ArrowRight")
    expect(document.activeElement).toBe(tab(MEDICAL))
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"])
  })

  it("moves focus with Left/Right (wrapping) and Home/End without activating", async () => {
    setup()
    tab("Contacts").focus()
    await press(tab("Contacts"), "ArrowRight")
    expect(document.activeElement).toBe(tab("Insurance"))
    await press(tab("Insurance"), "End")
    expect(document.activeElement).toBe(tab(MEDICAL))
    await press(tab(MEDICAL), "ArrowRight")
    expect(document.activeElement).toBe(tab("Contacts"))
    await press(tab("Contacts"), "ArrowLeft")
    expect(document.activeElement).toBe(tab(MEDICAL))
    await press(tab(MEDICAL), "Home")
    expect(document.activeElement).toBe(tab("Contacts"))
    expect(selected()).toBe("Contacts")
    expect(window.location.search).toBe("?tab=contacts")
  })

  it("activates with Enter through navigate: ?tab= by replace, hash dropped", async () => {
    setTestUrl("/?tab=contacts#email")
    setup()
    const before = window.history.length
    tab("Insurance").focus()
    await act(async () => fireEvent.keyDown(tab("Insurance"), { key: "Enter" }))
    expect(selected()).toBe("Insurance")
    expect(`${window.location.search}${window.location.hash}`).toBe("?tab=insurance")
    expect(window.history.length).toBe(before)
  })

  it("keeps other search params when a tab is activated", async () => {
    setTestUrl("/?x=1&tab=contacts")
    setup()
    await act(async () => fireEvent.mouseDown(tab("Insurance"), { button: 0 }))
    expect(window.location.search).toBe("?x=1&tab=insurance")
  })

  it("activates with Space and a click", async () => {
    setup()
    await act(async () => fireEvent.keyDown(tab(MEDICAL), { key: " " }))
    expect(selected()).toContain("Medical")
    await act(async () => fireEvent.mouseDown(tab("Contacts"), { button: 0 }))
    expect(selected()).toBe("Contacts")
  })

  it("shows the Medical copy and sends no data request when switching to Medical (only the activity ping)", async () => {
    setup()
    const requests = trackAllRequests()
    let pings = 0
    server.use(
      http.post("/api/session/ping", () => {
        pings += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await act(async () => fireEvent.mouseDown(tab(MEDICAL), { button: 0 }))
    expect(screen.getByText("Coming soon: medications, allergies and conditions will appear here")).toBeTruthy()
    await waitFor(() => expect(pings).toBe(1))
    expect(requests()).toBe(0)
  })

  it("asks the leave guard before a tab change when something is dirty", async () => {
    setup(true)
    fireEvent.change(screen.getByLabelText("Fixture phone"), { target: { value: "1" } })
    await act(async () => fireEvent.mouseDown(tab("Insurance"), { button: 0 }))
    expect(screen.getByRole("alertdialog", { name: "You have unsaved changes" })).toBeTruthy()
    expect(selected()).toBe("Contacts")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep editing" })))
    expect(selected()).toBe("Contacts")
    expect(window.location.search).toBe("?tab=contacts")
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    setup()
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
