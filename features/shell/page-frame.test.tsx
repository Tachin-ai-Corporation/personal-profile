import { act, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sessionEvents } from "@/lib/api"
import { server } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TestProviders, testIdle } from "@/test/providers"
import { resetLeaveState } from "./leave"
import { PageFrame } from "./page-frame"
import { ProfileTabs } from "./page-tabs"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

const MYSELF = "/api/1h/v2/user/myself"
const LOAD_ERROR = "Something went wrong while loading profile information"

function setup() {
  return render(
    <TestProviders>
      <PageFrame page="profile" header={<div data-testid="header-slot" />} idle={testIdle()}>
        <ProfileTabs />
      </PageFrame>
    </TestProviders>,
  )
}

beforeEach(() => {
  resetLeaveState()
  setTestUrl("/?tab=contacts")
})

describe("PageFrame", () => {
  it("renders app bar → header slot → tabs, the header and tabs inside main", async () => {
    server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })))
    setup()
    const banner = screen.getByRole("banner")
    const main = screen.getByRole("main")
    const slot = screen.getByTestId("header-slot")
    const tablist = screen.getByRole("tablist")
    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(main.contains(slot) && main.contains(tablist)).toBe(true)
    expect(slot.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("link", { name: "Personal Profile" }).getAttribute("aria-current")).toBe("page")
    await act(async () => undefined)
    expect(screen.queryByText(LOAD_ERROR)).toBeNull()
  })

  it("shows a myself read failure via ReadStateFor, and Retry refetches only myself", async () => {
    let calls = 0
    server.use(
      http.get(MYSELF, () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })
          : HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })
      }),
    )
    setup()
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })))
    await vi.waitFor(() => expect(screen.queryByText(LOAD_ERROR)).toBeNull())
    expect(calls).toBe(2)
  })

  it("a proxy 401 SESSION_EXPIRED publishes session-expired exactly once, opens the session dialog and shows no load error", async () => {
    let count = 0
    const off = sessionEvents.subscribe("session-expired", () => (count += 1))
    server.use(http.get(MYSELF, () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })))
    setup()
    expect(await screen.findByRole("alertdialog", { name: "Your session ended" })).toBeTruthy()
    expect(screen.queryByText(LOAD_ERROR)).toBeNull()
    off()
    expect(count).toBe(1)
  })

  it("starts each test with no session event published (no order dependence)", async () => {
    server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })))
    setup()
    await act(async () => undefined)
    expect(sessionEvents.hasPublished("session-expired")).toBe(false)
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})
