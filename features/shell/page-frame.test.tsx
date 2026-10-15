import { act, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { pageUser, sessionEvents } from "@/lib/api"
import { environmentConfig } from "@/lib/shared/environments"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { setTestUrl } from "@/test/next-navigation"
import { TestProviders, testIdle } from "@/test/providers"
import { FIXTURE_DRAFT_FIELDS, FixtureSection, fixtureDraftDiff } from "./__fixtures__/fixture-section"
import { resetLeaveState } from "./leave"
import { PageFrame } from "./page-frame"
import { PortalUrlProvider } from "./portal-url-provider"
import { ProfileTabs } from "./profile-tabs"
import { useDirtyCount } from "./section-registry"
import { useMyself } from "./use-myself"

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

  it("renders the Save all slot after main on / (last in tab order), inside the page registry", async () => {
    server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })))
    function Slot() {
      return <span data-testid="save-all">{useDirtyCount()}</span>
    }
    render(
      <TestProviders>
        <PageFrame page="profile" header={null} idle={testIdle()} saveAllSlot={<Slot />}>
          <ProfileTabs />
        </PageFrame>
      </TestProviders>,
    )
    const slot = screen.getByTestId("save-all")
    expect(slot.textContent).toBe("0")
    const main = screen.getByRole("main")
    expect(main.contains(slot)).toBe(false)
    expect(main.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await act(async () => undefined)
  })

  it("accepts no Save all slot on /account (type error) and renders none even if forced", async () => {
    server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, firstName: "Ann", lastName: "Lee" })))
    const forced = { saveAllSlot: <span data-testid="save-all" /> } as unknown as { saveAllSlot?: never }
    render(
      <TestProviders>
        {/* @ts-expect-error: Save all exists only on / (AD-8). */}
        <PageFrame page="account" header={null} idle={testIdle()} saveAllSlot={<span />}>
          <div />
        </PageFrame>
        <PageFrame page="account" header={null} idle={testIdle()} {...forced}>
          <div />
        </PageFrame>
      </TestProviders>,
    )
    expect(screen.queryByTestId("save-all")).toBeNull()
    await act(async () => undefined)
  })

  it("keeps the drafts owner on the pinned page user when myself revalidates as another user (D-A)", async () => {
    let id = 42
    server.use(http.get(MYSELF, () => HttpResponse.json({ id, firstName: "Ann", lastName: "Lee" })))
    const key = (userId: number) => `pp:draft:v1:demo:${userId}:phone`
    stubViewport(1280)
    window.localStorage.clear()
    try {
      function Revalidate() {
        const { myself, retry } = useMyself()
        return (
          <button type="button" onClick={retry}>
            {`myself ${myself?.id ?? "none"}`}
          </button>
        )
      }
      render(
        <TestProviders>
          <PortalUrlProvider portalUrl={environmentConfig("demo").portalUrl}>
            <PageFrame page="profile" header={<Revalidate />} idle={testIdle()}>
              <FixtureSection draftFields={[...FIXTURE_DRAFT_FIELDS]} describeDraftDiff={fixtureDraftDiff} dataStatus="loaded" />
            </PageFrame>
          </PortalUrlProvider>
        </TestProviders>,
      )
      await screen.findByRole("button", { name: "myself 42" })
      expect(pageUser.id()).toBe(42)
      fireEvent.click(screen.getByRole("button", { name: "Edit" }))
      fireEvent.change(screen.getByRole("textbox", { name: "Number" }), { target: { value: "4155550000" } })
      await vi.waitFor(() => expect(window.localStorage.getItem(key(42))).not.toBeNull(), { timeout: 2000 })

      id = 43
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "myself 42" })))
      await screen.findByRole("button", { name: "myself 43" })
      fireEvent.change(screen.getByRole("textbox", { name: "Number" }), { target: { value: "4155550001" } })
      await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem(key(42)) ?? "{}").values?.number).toBe("4155550001"), { timeout: 2000 })
      expect(window.localStorage.getItem(key(43))).toBeNull()
      expect(pageUser.id()).toBe(42)
    } finally {
      window.localStorage.clear()
    }
  })
})
