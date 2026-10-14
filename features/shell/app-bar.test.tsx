import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { setTestUrl, testRouter } from "@/test/next-navigation"
import { server } from "@/test/msw-server"
import { TEST_PORTAL_URL, TestProviders } from "@/test/providers"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import { AppBar } from "./app-bar"
import { resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import type { PageId } from "./nav-types"
import { CurrentPageProvider } from "./navigate"
import { SectionRegistryProvider } from "./section-registry"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

function setup(current: PageId = "profile", withDirtyFixture = false) {
  return render(
    <TestProviders>
      <CurrentPageProvider value={current}>
        <SectionRegistryProvider>
          <AppBar current={current} />
          {withDirtyFixture ? <FixtureParticipant id="phone" label="Phone" displayOrder={2} /> : null}
          <LeaveGuard />
        </SectionRegistryProvider>
      </CurrentPageProvider>
    </TestProviders>,
  )
}

const nav = () => screen.getByRole("navigation", { name: "Pages" })
const item = (name: string) => screen.getByRole("link", { name })

beforeEach(() => {
  resetLeaveState()
  testRouter.push.mockClear()
  setTestUrl("/?tab=contacts")
})
afterEach(() => document.documentElement.classList.remove("dark"))

describe("AppBar", () => {
  it("shows a plain-text wordmark that never takes focus", () => {
    setup()
    const wordmark = screen.getByText("1health")
    expect(wordmark.tagName).toBe("SPAN")
    expect(wordmark.className).toContain("text-primary-text")
    expect(wordmark.hasAttribute("tabindex")).toBe(false)
    expect(wordmark.closest("a, button")).toBeNull()
  })

  it("has the Pages nav with the current page marked", () => {
    setup("account")
    expect(nav().querySelectorAll("a")).toHaveLength(2)
    expect(item("Account").getAttribute("aria-current")).toBe("page")
    expect(item("Account").className).toContain("md:border-primary")
    expect(item("Personal Profile").getAttribute("aria-current")).toBeNull()
    expect(item("Personal Profile").getAttribute("href")).toBe("/")
  })

  it("keeps 44 px targets", () => {
    setup()
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-11")
  })

  it("orders focusable elements page nav → Return to 1health", () => {
    setup()
    const focusable = [...document.querySelectorAll<HTMLElement>("a[href], button")].map((el) => el.textContent)
    expect(focusable).toEqual(["Personal Profile", "Account", "Return to 1health"])
  })

  it("does nothing for the current page's item", async () => {
    setup("profile")
    await act(async () => fireEvent.click(item("Personal Profile")))
    expect(testRouter.push).not.toHaveBeenCalled()
  })

  it("switches page with router.push when clean", async () => {
    setup("profile")
    await act(async () => fireEvent.click(item("Account")))
    expect(testRouter.push).toHaveBeenCalledWith("/account")
  })

  it("leaves modified clicks to the browser", () => {
    setup("profile")
    let preventedByApp: boolean | undefined
    // Runs after React's handler; stops jsdom from attempting the real navigation.
    const record = (event: Event) => {
      preventedByApp = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener("click", record)
    item("Account").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }))
    document.removeEventListener("click", record)
    expect(preventedByApp).toBe(false)
    expect(testRouter.push).not.toHaveBeenCalled()
  })

  it("runs the leave guard before a page switch when something is dirty", async () => {
    setup("profile", true)
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "1" } })
    await act(async () => fireEvent.click(item("Account")))
    expect(screen.getByRole("alertdialog", { name: "You have unsaved changes" })).toBeTruthy()
    expect(testRouter.push).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard" })))
    await waitFor(() => expect(testRouter.push).toHaveBeenCalledWith("/account"))
  })

  it("Return to 1health logs out, then goes to the portal in the same tab", async () => {
    const calls: string[] = []
    server.use(
      http.post("/api/session/logout", () => {
        calls.push("logout")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const assign = vi.fn((url: string) => void calls.push(`assign ${url}`))
    vi.stubGlobal("location", { ...window.location, assign, pathname: "/", search: "?tab=contacts" })
    setup()
    const link = screen.getByRole("link", { name: "Return to 1health" })
    expect(link.className).toContain("text-link-text")
    expect(link.getAttribute("href")).toBe(TEST_PORTAL_URL)
    expect(link.querySelector("svg[aria-hidden='true']")).not.toBeNull()
    await act(async () => fireEvent.click(link))
    await waitFor(() => expect(calls).toEqual(["logout", `assign ${TEST_PORTAL_URL}`]))
  })

  it("leaves a modified click on Return to 1health to the browser: no logout, no navigate", async () => {
    let logouts = 0
    server.use(
      http.post("/api/session/logout", () => {
        logouts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    setup()
    let preventedByApp: boolean | undefined
    const record = (event: Event) => {
      preventedByApp = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener("click", record)
    for (const modifier of ["ctrlKey", "metaKey", "shiftKey"] as const) {
      screen.getByRole("link", { name: "Return to 1health" }).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, [modifier]: true }))
      expect(preventedByApp).toBe(false)
    }
    document.removeEventListener("click", record)
    await act(async () => undefined)
    expect(logouts).toBe(0)
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    setup()
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
