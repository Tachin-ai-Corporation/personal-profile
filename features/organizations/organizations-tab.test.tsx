import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { SWRConfig } from "swr"
import { renderToString } from "react-dom/server"
import { sessionEvents } from "@/lib/api"
import { ORG_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { CHECKOUT_URL } from "@/lib/shared/profile-constants"
import { renderInPage, TestProviders } from "@/test/providers"
import { myselfWire } from "@/test/myself-fixture"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { axeViolations } from "@/test/axe"
import { OrganizationsTab } from "./organizations-tab"

const navigation = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
vi.mock("@/features/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/shell")>()),
  useNavigate: () => navigation,
}))

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

const READ = "/api/1h/v2/user/organization/portal"
const row = (name = "Alpha", tenantId: number | string = 1) => ({ tenantId, enabledInTenant: true, organization: { name, shortOrganizationName: null, type: [], personContacts: [] } })
const page = (data: unknown[] = [row()], totalElements = data.length, totalPages = data.length ? 1 : 0, pageNumber = 0) => ({ data, totalElements, totalPages, pageNumber, lastPage: pageNumber >= totalPages - 1 })
const search = () => screen.getByRole("searchbox", { name: ORG_MESSAGES.searchLabel })
const renderList = (handlers: Parameters<typeof renderInPage>[1]["handlers"] = []) => renderInPage(<OrganizationsTab />, { page: "account", handlers })

beforeEach(() => { navigation.mockClear(); stubLayoutApis(); stubViewport(1280) })

describe("My Organizations list", () => {
  it("loads lazily with twelve cards, preserves server count and shows the single-page pager", async () => {
    let finish!: (response: Response) => void
    const view = renderList([http.get(READ, () => new Promise<Response>((done) => { finish = done }))])
    expect(view.container.querySelectorAll('[data-slot="frame-skeleton-card"]')).toHaveLength(12)
    expect(screen.queryByRole("searchbox")).toBeNull()
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    await act(async () => finish(HttpResponse.json(page([row("Zulu", 2), row("Alpha")], 27))))
    expect(screen.getAllByRole("article").map((item) => item.querySelector("h3")?.textContent)).toEqual(["Alpha", "Zulu"])
    expect(screen.getByRole("status").textContent).toBe("27 organizations")
    const previous = screen.getByRole("button", { name: "Previous" })
    const next = screen.getByRole("button", { name: "Next" })
    expect(previous.getAttribute("aria-disabled")).toBe("true")
    expect(next.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(previous); fireEvent.click(next)
    fireEvent.click(screen.getByRole("button", { name: "1" }))
    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page")
    expect(await axeViolations()).toEqual([])
  })
  it.each([[[]], [[{ tenantId: 1, organization: null }]]])("initial empty page %j offers regular checkout without controls", async (rows) => {
    renderList([http.get(READ, () => HttpResponse.json(page(rows, 90, 8)))])
    await screen.findByRole("heading", { name: ORG_MESSAGES.emptyTitle })
    const link = screen.getByRole("link", { name: ORG_MESSAGES.registerExternal })
    expect(link.getAttribute("href")).toBe(CHECKOUT_URL)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.queryByRole("navigation")).toBeNull()
  })
  it.each(["Ann@1HEALTH.IO", "ann@tachin.ai"])("internal identity %s gets creation and registration buttons", async (email) => {
    renderList([http.get(READ, () => HttpResponse.json(page([]))), http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire({ email })))])
    expect(await screen.findByRole("button", { name: ORG_MESSAGES.register })).toBeTruthy()
    expect(screen.queryByRole("link", { name: ORG_MESSAGES.registerExternal })).toBeNull()
  })
  it.each(["foo@1health.io.evil.com", "foo@not1health.io", null])("regular or unknown identity %s receives no internal privileges", async (email) => {
    renderList([http.get(READ, () => HttpResponse.json(page([]))), http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire({ email })))])
    await screen.findByRole("link", { name: ORG_MESSAGES.registerExternal })
    expect(screen.queryByRole("button", { name: ORG_MESSAGES.register })).toBeNull()
  })
  it("debounces 500ms, trims, ignores unchanged trimmed text and resets pages atomically without stealing focus", async () => {
    const calls: string[] = []
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    renderList([http.get(READ, ({ request }) => {
      const q = new URL(request.url).searchParams
      const name = q.get("name") ?? ""; const number = Number(q.get("page"))
      calls.push(`${name}:${number}`)
      return HttpResponse.json(name ? page([]) : page([row(number ? "Beta" : "Alpha")], 24, 2, number))
    })])
    await screen.findByRole("article")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await screen.findByRole("heading", { name: "Beta" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Beta" })))
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" })
    act(() => search().focus())
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      fireEvent.change(search(), { target: { value: " old " } })
      fireEvent.change(search(), { target: { value: " new " } })
      await act(async () => { await vi.advanceTimersByTimeAsync(499) })
      expect(calls).toEqual([":0", ":1"])
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    } finally { vi.useRealTimers() }
    await screen.findByText(ORG_MESSAGES.noResults)
    expect(calls).toEqual([":0", ":1", "new:0"])
    expect(document.activeElement).toBe(search())
    expect(search()).toHaveProperty("value", " new ")
    expect(screen.getByRole("status").textContent).toBe("0 organizations")
    expect(screen.queryByRole("navigation")).toBeNull()
    fireEvent.change(search(), { target: { value: "new" } })
    await act(async () => { await new Promise((done) => setTimeout(done, 550)) })
    expect(calls).toHaveLength(3)
  })
  it("ignores obsolete query results and late forbidden errors", async () => {
    let finishOld!: (response: Response) => void
    renderList([http.get(READ, ({ request }) => {
      const name = new URL(request.url).searchParams.get("name")
      return name === "old" ? new Promise<Response>((done) => { finishOld = done }) : HttpResponse.json(page([row(name || "Alpha")]))
    })])
    await screen.findByRole("article")
    fireEvent.change(search(), { target: { value: "old" } })
    await waitFor(() => expect(finishOld).toBeTypeOf("function"))
    fireEvent.change(search(), { target: { value: "new" } })
    await screen.findByRole("heading", { name: "new" })
    await act(async () => finishOld(HttpResponse.json({ message: "Denied" }, { status: 403 })))
    expect(screen.queryByText(STATE_MESSAGES.noAccess)).toBeNull()
    expect(screen.getByRole("heading", { name: "new" })).toBeTruthy()
  })
  it.each([500, "proxy403", "network"])("retries only the active query and reannounces repeated %s failures", async (failure) => {
    const calls: string[] = []
    renderList([http.get(READ, ({ request }) => {
      const name = new URL(request.url).searchParams.get("name") ?? ""
      calls.push(name)
      if (!name || calls.length > 3) return HttpResponse.json(page([row(name || "Alpha")]))
      return failure === "network" ? HttpResponse.error() : HttpResponse.json(failure === "proxy403" ? { source: "proxy", errorCode: "NOT_ALLOWED" } : { message: "Failed" }, { status: failure === "proxy403" ? 403 : 500 })
    })])
    await screen.findByRole("article")
    fireEvent.change(search(), { target: { value: "target" } })
    const alert = await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(alert))
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("heading", { name: "target" })
    expect(calls).toEqual(["", "target", "target", "target"])
  })
  it("upstream 403 replaces the whole tab, including existing controls", async () => {
    renderList([http.get(READ, ({ request }) => new URL(request.url).searchParams.get("name") ? HttpResponse.json({ message: "Denied" }, { status: 403 }) : HttpResponse.json(page()))])
    await screen.findByRole("article")
    fireEvent.change(search(), { target: { value: "denied" } })
    await screen.findByText(STATE_MESSAGES.noAccess)
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.queryByRole("article")).toBeNull()
    expect(screen.queryByRole("navigation")).toBeNull()
  })
  it("session expiry removes controls and ignores a pending response", async () => {
    let finish!: (response: Response) => void
    renderList([http.get(READ, ({ request }) => new URL(request.url).searchParams.get("name") ? new Promise<Response>((done) => { finish = done }) : HttpResponse.json(page()))])
    await screen.findByRole("article")
    fireEvent.change(search(), { target: { value: "pending" } })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    act(() => sessionEvents.publish("session-expired"))
    await act(async () => finish(HttpResponse.json(page())))
    expect(screen.queryByRole("searchbox")).toBeNull()
    expect(screen.queryByRole("article")).toBeNull()
  })
  it("freshly validates a reopened tab before exposing cached membership", async () => {
    let calls = 0
    let finish!: (response: Response) => void
    function Toggle() {
      const [open, setOpen] = useState(true)
      return <><button onClick={() => setOpen(!open)}>Toggle organizations</button>{open ? <OrganizationsTab /> : null}</>
    }
    renderInPage(<Toggle />, { page: "account", handlers: [http.get(READ, () => {
      calls++
      return calls === 1 ? HttpResponse.json(page()) : new Promise<Response>((done) => { finish = done })
    })] })
    await screen.findByRole("article")
    fireEvent.click(screen.getByRole("button", { name: "Toggle organizations" }))
    fireEvent.click(screen.getByRole("button", { name: "Toggle organizations" }))
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    expect(screen.queryByRole("article")).toBeNull()
    await act(async () => finish(HttpResponse.json(page([]))))
    await screen.findByRole("heading", { name: ORG_MESSAGES.emptyTitle })
    expect(calls).toBe(2)
  })
  it("initial failures keep registration hidden, retain approved 4xx text, and recover with Retry", async () => {
    let calls = 0
    renderList([http.get(READ, () => ++calls === 1 ? HttpResponse.json({ message: "Organization access is temporarily restricted." }, { status: 400 }) : HttpResponse.json(page([])))])
    await screen.findByText("Organization access is temporarily restricted.")
    expect(screen.queryByRole("link", { name: ORG_MESSAGES.registerExternal })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("heading", { name: ORG_MESSAGES.emptyTitle })
    expect(calls).toBe(2)
  })
  it("failed identity cannot qualify for internal creation", async () => {
    renderList([http.get(READ, () => HttpResponse.json(page([]))), http.get("/api/1h/v2/user/myself", () => HttpResponse.json({}, { status: 500 }))])
    await screen.findByRole("link", { name: ORG_MESSAGES.registerExternal })
    expect(screen.queryByRole("button", { name: ORG_MESSAGES.register })).toBeNull()
  })
  it("uses smooth scroll when motion is allowed", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView")
    renderList([http.get(READ, ({ request }) => {
      const number = Number(new URL(request.url).searchParams.get("page"))
      return HttpResponse.json(page([row(number ? "Beta" : "Alpha")], 24, 2, number))
    })])
    await screen.findByRole("article")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await screen.findByRole("heading", { name: "Beta" })
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" }))
  })
  it("server-renders a stable loading frame and suppresses reads after expiry", async () => {
    expect(renderToString(<TestProviders><OrganizationsTab /></TestProviders>)).toContain('data-state="loading"')
    sessionEvents.publish("session-expired")
    const read = vi.fn(() => HttpResponse.json(page()))
    renderList([http.get(READ, read)])
    await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByRole("searchbox")).toBeNull()
  })

  it.each([false, true])("internal creation action in empty state %s uses the guarded shell handoff", async (empty) => {
    renderList([http.get(READ, () => HttpResponse.json(page(empty ? [] : [row()]))), http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire({ email: "ann@1health.io" })))])
    fireEvent.click(await screen.findByRole("button", { name: empty ? ORG_MESSAGES.register : ORG_MESSAGES.create }))
    expect(navigation).toHaveBeenCalledWith({ external: "handoff", href: "/handoff/portal?to=create-org" })
  })

  it("typing cancels pending page focus and expiry cancels the queued search", async () => {
    let finish!: (response: Response) => void
    const calls: string[] = []
    renderList([http.get(READ, ({ request }) => {
      const q = new URL(request.url).searchParams
      calls.push(`${q.get("name")}:${q.get("page")}`)
      return q.get("page") === "1" ? new Promise<Response>((done) => { finish = done }) : HttpResponse.json(page([row()], 24, 2))
    })])
    await screen.findByRole("article")
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    act(() => search().focus())
    fireEvent.change(search(), { target: { value: "pending" } })
    await act(async () => finish(HttpResponse.json(page([row("Beta")], 24, 2, 1))))
    await screen.findByRole("heading", { name: "Beta" })
    expect(document.activeElement).toBe(search())
    act(() => sessionEvents.publish("session-expired"))
    await act(async () => { await new Promise((done) => setTimeout(done, 550)) })
    expect(calls).toEqual([":0", ":1"])
    expect(screen.queryByRole("searchbox")).toBeNull()
  })

  it("returning to a recent query inside SWR deduplication becomes ready again", async () => {
    const queries: string[] = []
    renderInPage(<SWRConfig value={{ dedupingInterval: 2000 }}><OrganizationsTab /></SWRConfig>, { page: "account", handlers: [http.get(READ, ({ request }) => {
      const name = new URL(request.url).searchParams.get("name") ?? ""
      queries.push(name)
      return HttpResponse.json(page([row(name === "B" ? "Beta" : "Alpha")]))
    })] })
    await screen.findByRole("heading", { name: "Alpha" })
    fireEvent.change(search(), { target: { value: "B" } })
    await screen.findByRole("heading", { name: "Beta" })
    fireEvent.change(search(), { target: { value: "" } })
    await screen.findByRole("heading", { name: "Alpha" })
    expect(queries).toEqual(["", "B"])
  })

  it("keeps server pagination available on a null-only later page and focuses its empty result", async () => {
    const requests: number[] = []
    renderList([http.get(READ, ({ request }) => {
      const number = Number(new URL(request.url).searchParams.get("page"))
      requests.push(number)
      return HttpResponse.json(page(number ? [{ tenantId: 2, organization: null }] : [row()], 13, 2, number))
    })])
    await screen.findByRole("heading", { name: "Alpha" })
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    const emptyResult = await screen.findByText(ORG_MESSAGES.noResults)
    await waitFor(() => expect(document.activeElement).toBe(emptyResult))
    expect(screen.getByRole("status").textContent).toBe("13 organizations")
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("button", { name: "Previous" }).getAttribute("aria-disabled")).toBeNull()
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    const heading = await screen.findByRole("heading", { name: "Alpha" })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(requests.slice(0, 2)).toEqual([0, 1])
    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page")
  })

  it.each([
    ["one page", 1, false],
    ["first of two pages", 2, true],
  ] as const)("a searched null-only %s shows no results with the pager only when another page exists (parity)", async (_label, totalPages, pager) => {
    renderList([http.get(READ, ({ request }) => new URL(request.url).searchParams.get("name")
      ? HttpResponse.json(page([{ tenantId: 2, organization: null }], totalPages === 1 ? 1 : 13, totalPages))
      : HttpResponse.json(page()))])
    await screen.findByRole("article")
    fireEvent.change(search(), { target: { value: "ghost" } })
    await screen.findByText(ORG_MESSAGES.noResults)
    expect(screen.queryByRole("article")).toBeNull()
    if (pager) expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBeNull()
    else expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryAllByRole("navigation", { name: ORG_MESSAGES.paginationLabel })).toHaveLength(pager ? 1 : 0)
  })

  it("ignores pagination while a different search waits for its debounce and keeps search focus", async () => {
    const requests: string[] = []
    renderList([http.get(READ, ({ request }) => {
      const q = new URL(request.url).searchParams
      requests.push(`${q.get("name")}:${q.get("page")}`)
      return HttpResponse.json(page([row(q.get("name") ? "Beta" : "Alpha")], 24, 2, Number(q.get("page"))))
    })])
    await screen.findByRole("heading", { name: "Alpha" })
    act(() => search().focus())
    fireEvent.change(search(), { target: { value: " Beta " } })
    for (const button of screen.getByRole("navigation").querySelectorAll("button")) {
      expect(button.getAttribute("aria-disabled")).toBe("true")
      expect(button.hasAttribute("disabled")).toBe(false)
      expect(button.tabIndex).toBe(0)
    }
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(requests).toEqual([":0"])
    expect(document.activeElement).toBe(search())
    await screen.findByRole("heading", { name: "Beta" })
    expect(requests).toEqual([":0", "Beta:0"])
    expect(document.activeElement).toBe(search())
    expect(screen.getByRole("button", { name: "1" }).getAttribute("aria-current")).toBe("page")
  })

  it("waits for IME composition to end before debouncing the final text and keeps input focus", async () => {
    const names: string[] = []
    renderList([http.get(READ, ({ request }) => {
      const name = new URL(request.url).searchParams.get("name") ?? ""
      names.push(name)
      return HttpResponse.json(page([row(name || "Alpha")], 24, 2))
    })])
    await screen.findByRole("heading", { name: "Alpha" })
    act(() => search().focus())
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      fireEvent.compositionStart(search())
      fireEvent.change(search(), { target: { value: "に" } })
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      fireEvent.change(search(), { target: { value: "日本" } })
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      expect(names).toEqual([""])
      expect(document.activeElement).toBe(search())
      expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBe("true")
      fireEvent.compositionEnd(search(), { data: "日本" })
      await act(async () => { await vi.advanceTimersByTimeAsync(499) })
      expect(names).toEqual([""])
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    } finally { vi.useRealTimers() }
    await screen.findByRole("heading", { name: "日本" })
    expect(names).toEqual(["", "日本"])
    expect(document.activeElement).toBe(search())
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBeNull()
  })
  it.each([false, true])("recovers an entirely emptied later page to page zero with filtered=%s", async (filtered) => {
    const requests: string[] = []
    let removed = false
    let finishRecovery!: (response: Response) => void
    renderInPage(<SWRConfig value={{ dedupingInterval: 2000 }}><OrganizationsTab /></SWRConfig>, { page: "account", handlers: [http.get(READ, ({ request }) => {
      const q = new URL(request.url).searchParams
      const number = Number(q.get("page"))
      requests.push(`${q.get("name")}:${number}`)
      if (number === 1) removed = true
      else if (removed) return new Promise<Response>((done) => { finishRecovery = done })
      return HttpResponse.json(removed ? page([], 0, 0, number) : page([row()], 13, 2, number))
    })] })
    await screen.findByRole("heading", { name: "Alpha" })
    if (filtered) {
      fireEvent.change(search(), { target: { value: " filter " } })
      await waitFor(() => expect(requests).toEqual([":0", "filter:0"]))
      await waitFor(() => expect(screen.getByRole("article")).toBeTruthy())
      act(() => search().focus())
    }
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(finishRecovery).toBeTypeOf("function"))
    expect(screen.queryByRole("article")).toBeNull()
    expect(screen.queryByRole("heading", { name: ORG_MESSAGES.emptyTitle })).toBeNull()
    await act(async () => finishRecovery(HttpResponse.json(page([], 0, 0, 0))))
    if (filtered) {
      await screen.findByText(ORG_MESSAGES.noResults)
      await waitFor(() => expect(requests).toEqual([":0", "filter:0", "filter:1", "filter:0"]))
      expect(search()).toHaveProperty("value", " filter ")
      expect(document.activeElement).toBe(search())
      expect(screen.queryByRole("heading", { name: ORG_MESSAGES.emptyTitle })).toBeNull()
    } else {
      await screen.findByRole("heading", { name: ORG_MESSAGES.emptyTitle })
      expect(requests).toEqual([":0", ":1", ":0"])
      expect(screen.queryByRole("searchbox")).toBeNull()
    }
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("0 organizations")
  })

})
