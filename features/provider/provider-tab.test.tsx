import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, delay } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import useSWR, { SWRConfig } from "swr"
import { useLayoutEffect, useState } from "react"
import { renderToString } from "react-dom/server"
import { callApi, keys, organizationsPath, sessionEvents, unwrap } from "@/lib/api"
import { NPI_MESSAGES, STATE_MESSAGES, COMBOBOX_MESSAGES } from "@/lib/shared/messages"
import { renderInPage, TestProviders } from "@/test/providers"
import { stubLayoutApis } from "@/test/dom-stubs"
import { myselfWire } from "@/test/myself-fixture"
import { stubViewport } from "@/test/media"
import { axeViolations } from "@/test/axe"
import { ProviderTab } from "./provider-tab"

const READ = "/api/1h/v2/user/npi"
const SEARCH = "/api/1h/v2/public/npi/list"
const person = (id = 77) => ({ id, npi: 1234567890 + id, providerFirstName: `Ann${id}`, providerLastName: "Lee", providerBusinessMailingAddressCityName: "Austin", providerBusinessMailingAddressStateName: "TX" })
const personal = () => screen.getByRole("combobox", { name: NPI_MESSAGES.personalSearch })
const practice = () => screen.getByRole("combobox", { name: new RegExp("Search for your practice") })
function renderProvider(handlers: Parameters<typeof renderInPage>[1]["handlers"] = []) { return renderInPage(<ProviderTab />, { page: "account", handlers }) }

beforeEach(() => { stubLayoutApis(); stubViewport(1280) })

describe("Healthcare credentials", () => {
  it("server-renders its heading and loading frame with a stable expiry snapshot", () => {
    const markup = renderToString(<TestProviders><ProviderTab /></TestProviders>)
    expect(markup).toContain(NPI_MESSAGES.heading)
    expect(markup).toContain('data-state="loading"')
    expect(markup).not.toContain('role="combobox"')
  })
  it("keeps its heading and two-bar skeleton while loading, then reports ready", async () => {
    const view = renderProvider([http.get(READ, async () => { await delay(40); return HttpResponse.json({ providerNpi: null }) })])
    expect(screen.getByRole("heading", { name: NPI_MESSAGES.heading }).tabIndex).toBe(-1)
    expect(view.container.querySelector('[data-variant="bars"]')?.children).toHaveLength(2)
    expect(screen.queryByRole("combobox")).toBeNull()
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    expect(view.frameReady).toHaveBeenCalledWith("provider")
    expect(personal().getAttribute("aria-required")).toBe("true")
    expect(practice().getAttribute("maxlength")).toBe("100")
    expect(await axeViolations()).toEqual([])
  })
  it.each([false, true])("hides cached registration %s until a fresh tab-opening read settles", async (registered) => {
    let finish!: (response: Response) => void
    let calls = 0
    function Tabs() {
      const [open, setOpen] = useState(true)
      return <><button onClick={() => setOpen(!open)}>Toggle provider</button>{open ? <ProviderTab /> : null}</>
    }
    renderInPage(<Tabs />, { page: "account", handlers: [http.get(READ, () => {
      calls++
      if (calls === 1) return HttpResponse.json(registered ? { providerNpi: { id: 77, npi: 1234567890 } } : {})
      return new Promise<Response>((resolve) => { finish = resolve })
    })] })
    if (registered) await screen.findByRole("table")
    else await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    fireEvent.click(screen.getByRole("button", { name: "Toggle provider" }))
    fireEvent.click(screen.getByRole("button", { name: "Toggle provider" }))
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
    await act(async () => finish(HttpResponse.json(registered ? {} : { providerNpi: { id: 77, npi: 1234567890 } })))
    if (registered) await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    else await screen.findByRole("table")
    expect(calls).toBe(2)
  })
  it("shows a registered NPI read-only, without searches or Register", async () => {
    renderProvider([http.get(READ, () => HttpResponse.json({ providerNpi: { id: 77, npi: 1234567890 } }))])
    expect(await screen.findByRole("table")).toBeTruthy()
    expect(screen.getByText("1234567890").classList.contains("mono-value")).toBe(true)
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: "Register" })).toBeNull()
  })
  it.each([404, 500, "malformed", "proxy403"])("load failure %s never renders the unregistered form and retries only NPI", async (failure) => {
    let calls = 0
    renderProvider([http.get(READ, () => {
      calls++
      if (calls > 2) return HttpResponse.json({})
      return failure === "malformed" ? HttpResponse.json([]) : failure === "proxy403" ? HttpResponse.json({ source: "proxy", errorCode: "NOT_ALLOWED" }, { status: 403 }) : HttpResponse.json({ message: "Rejected" }, { status: failure as number })
    })])
    expect(await screen.findByText(STATE_MESSAGES.loadError)).toBeTruthy()
    expect(screen.queryByRole("combobox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    await screen.findByText(STATE_MESSAGES.loadError)
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    expect(calls).toBe(3)
  })
  it("upstream403 removes the entire Provider content", async () => {
    renderProvider([http.get(READ, () => HttpResponse.json({ message: "Denied" }, { status: 403 }))])
    expect(await screen.findByText(STATE_MESSAGES.noAccess)).toBeTruthy()
    expect(screen.queryByRole("heading", { name: NPI_MESSAGES.heading })).toBeNull()
    expect(screen.queryByRole("button", { name: NPI_MESSAGES.about })).toBeNull()
  })
  it("opens the informational popover without stealing focus and Escape closes it", async () => {
    const user = userEvent.setup()
    renderProvider()
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    const trigger = screen.getByRole("button", { name: NPI_MESSAGES.about })
    act(() => trigger.focus())
    expect(await screen.findByText(NPI_MESSAGES.information)).toBeTruthy()
    expect(document.activeElement).toBe(trigger)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByText(NPI_MESSAGES.information)).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
  it("locks both field types, loads on focus, selects/clears and keeps Register inert", async () => {
    const user = userEvent.setup()
    const requests: URLSearchParams[] = []
    const writes = vi.fn()
    const storage = vi.spyOn(Storage.prototype, "setItem")
    renderProvider([http.get(SEARCH, ({ request }) => {
      const params = new URL(request.url).searchParams
      requests.push(params)
      return HttpResponse.json({ data: params.get("searchText") === "none" ? [] : [person()], totalElements: params.get("searchText") === "none" ? 0 : 1 })
    }), http.post("/api/1h/*", writes)])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    await user.click(personal())
    const option = await screen.findByRole("option", { name: "1234567967, Ann77 Lee, Austin, TX" })
    expect(requests[0].get("searchText")).toBe("")
    expect(requests[0].get("page")).toBe("0")
    expect(requests[0].get("entityTypeCode")).toBe("1")
    expect(await screen.findAllByText(COMBOBOX_MESSAGES.noMoreResults)).toBeTruthy()
    await user.keyboard("{ArrowDown}{Enter}")
    expect(option).toBeTruthy()
    expect(personal()).toHaveProperty("value", "1234567967, Ann77 Lee, Austin, TX")
    await user.type(personal(), "x")
    await user.click(screen.getByRole("button", { name: `Clear ${NPI_MESSAGES.personalSearch}` }))
    expect(personal()).toHaveProperty("value", "")
    expect(document.activeElement).toBe(personal())
    await user.click(practice())
    await screen.findByRole("option", { name: "1234567967, Austin, TX" })
    expect(requests.at(-1)?.get("entityTypeCode")).toBe("2")
    await user.type(practice(), "none")
    await screen.findAllByText(COMBOBOX_MESSAGES.npiNoMatches)
    expect(requests.at(-1)?.get("searchText")).toBe("none")
    await user.click(screen.getByRole("button", { name: "Register" }))
    expect(writes).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
    expect(window.location.search).not.toMatch(/Ann|npi|none/)
  })
  it.each([403, "proxy403", 500, "malformed"])("search failure %s maps at the right scope", async (failure) => {
    renderProvider([http.get(SEARCH, () => failure === "malformed" ? HttpResponse.json({ content: [] }) : failure === "proxy403" ? HttpResponse.json({ errorCode: "NOT_ALLOWED", source: "proxy" }, { status: 403 }) : HttpResponse.json({ message: "Denied" }, { status: failure as number }))])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    fireEvent.focus(personal())
    if (failure === 403) {
      await screen.findByText(STATE_MESSAGES.noAccess)
      expect(screen.queryByRole("heading", { name: NPI_MESSAGES.heading })).toBeNull()
    } else {
      await screen.findAllByText(COMBOBOX_MESSAGES.loadError)
      expect(screen.getByRole("button", { name: "Try again." })).toBeTruthy()
      expect(screen.getByRole("heading", { name: NPI_MESSAGES.heading })).toBeTruthy()
    }
  })
  it.each(["http500", "network", "timeout"])("pagination %s errors preserve options and retry the exact page/query", async (failure) => {
    const user = userEvent.setup()
    const requests: string[] = []
    let failed = false
    renderProvider([http.get(SEARCH, ({ request }) => {
      const q = new URL(request.url).searchParams
      requests.push(`${q.get("searchText")}:${q.get("page")}`)
      if (q.get("page") === "1" && !failed) {
        failed = true
        return failure === "network" ? HttpResponse.error() : HttpResponse.json(failure === "timeout" ? { errorCode: "UPSTREAM_TIMEOUT", source: "proxy" } : {}, { status: failure === "timeout" ? 504 : 500 })
      }
      return HttpResponse.json({ data: q.get("page") === "0" ? Array.from({ length: 10 }, (_, i) => person(i + 1)) : [person(11)], totalElements: 11 })
    })])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    await user.click(personal())
    await screen.findByRole("option", { name: "1234567891, Ann1 Lee, Austin, TX" })
    await user.keyboard("{ArrowDown}{End}")
    await screen.findAllByText(COMBOBOX_MESSAGES.loadError)
    expect(screen.getAllByRole("option").length).toBe(10)
    await user.click(screen.getByRole("button", { name: "Try again." }))
    await screen.findByRole("option", { name: "1234567901, Ann11 Lee, Austin, TX" })
    expect(requests).toEqual([":0", ":1", ":1"])
    await screen.findAllByText(COMBOBOX_MESSAGES.noMoreResults)
  })
  it("debounces for exactly 600ms and makes settled Ann options unpickable while Bob is pending", async () => {
    const queries: string[] = []
    renderProvider([http.get(SEARCH, ({ request }) => {
      const query = new URL(request.url).searchParams.get("searchText") ?? ""
      queries.push(query)
      return HttpResponse.json({ data: [{ ...person(), providerFirstName: query }], totalElements: 1 })
    })])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    fireEvent.change(personal(), { target: { value: "Ann" } })
    await screen.findByRole("option", { name: "1234567967, Ann Lee, Austin, TX" })
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      fireEvent.change(personal(), { target: { value: "Bob" } })
      expect(screen.queryByRole("option")).toBeNull()
      fireEvent.keyDown(personal(), { key: "Enter" })
      expect(personal()).toHaveProperty("value", "Bob")
      await act(async () => { await vi.advanceTimersByTimeAsync(599) })
      expect(queries).toEqual(["Ann"])
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    } finally { vi.useRealTimers() }
    await screen.findByRole("option", { name: "1234567967, Bob Lee, Austin, TX" })
    expect(queries).toEqual(["Ann", "Bob"])
    fireEvent.keyDown(personal(), { key: "ArrowDown" })
    fireEvent.keyDown(personal(), { key: "Enter" })
    expect(personal()).toHaveProperty("value", "1234567967, Bob Lee, Austin, TX")
  })

  it("re-announces identical read errors and retries NPI without reloading other Account reads", async () => {
    const calls = { npi: 0, myself: 0, organizations: 0 }
    function OtherAccountReads() {
      const myself = useSWR<{ id: number }>(keys.myself())
      const organizations = useSWR(keys.orgs("", 0), () => unwrap(callApi("organizations/read", organizationsPath("", 0))))
      return <output>{myself.data && organizations.data ? "Other reads ready" : "Waiting"}</output>
    }
    renderInPage(<><OtherAccountReads /><ProviderTab /></>, { page: "account", handlers: [
      http.get("/api/1h/v2/user/myself", () => { calls.myself++; return HttpResponse.json(myselfWire()) }),
      http.get("/api/1h/v2/user/organization/portal", () => { calls.organizations++; return HttpResponse.json({ content: [] }) }),
      http.get(READ, () => { calls.npi++; return calls.npi < 3 ? HttpResponse.json({ message: "Same failure" }, { status: 500 }) : HttpResponse.json({}) }),
    ] })
    await screen.findByText("Other reads ready")
    const firstAlert = await screen.findByRole("alert")
    expect(firstAlert.textContent).toBe(STATE_MESSAGES.loadError)
    expect(calls).toEqual({ npi: 1, myself: 1, organizations: 1 })
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    // A fresh live alert node is inserted even though the sentence is identical.
    await waitFor(() => expect(screen.getByRole("alert")).not.toBe(firstAlert))
    expect(screen.getByRole("alert").textContent).toBe(STATE_MESSAGES.loadError)
    expect(calls).toEqual({ npi: 2, myself: 1, organizations: 1 })
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    expect(calls).toEqual({ npi: 3, myself: 1, organizations: 1 })
  })
  it("ignores an aborted older query, including a late forbidden response", async () => {
    let resolveOld!: (response: Response) => void
    const queries: string[] = []
    const user = userEvent.setup()
    renderProvider([http.get(SEARCH, ({ request }) => {
      const query = new URL(request.url).searchParams.get("searchText") ?? ""
      queries.push(query)
      if (query === "old") return new Promise<Response>((done) => { resolveOld = done })
      return HttpResponse.json({ data: query === "new" ? [person()] : [], totalElements: query === "new" ? 1 : 0 })
    })])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    await user.click(personal())
    await screen.findAllByText(COMBOBOX_MESSAGES.npiNoMatches)
    fireEvent.change(personal(), { target: { value: " old " } })
    expect(queries).toEqual([""])
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"))
    fireEvent.change(personal(), { target: { value: "new" } })
    await screen.findByRole("option", { name: "1234567967, Ann77 Lee, Austin, TX" })
    await act(async () => resolveOld(HttpResponse.json({ message: "Denied" }, { status: 403 })))
    expect(screen.getByRole("combobox", { name: NPI_MESSAGES.personalSearch })).toHaveProperty("value", "new")
    expect(screen.queryByText(STATE_MESSAGES.noAccess)).toBeNull()
    expect(queries).toEqual(["", "old", "new"])
  })
  it("expires ephemeral picks/results and prevents an in-flight response restoring them", async () => {
    let resolve!: (response: Response) => void
    renderProvider([http.get(SEARCH, () => new Promise<Response>((done) => { resolve = done }))])
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    fireEvent.focus(personal())
    await waitFor(() => expect(resolve).toBeTypeOf("function"))
    act(() => sessionEvents.publish("session-expired"))
    expect(screen.queryByRole("combobox")).toBeNull()
    await act(async () => resolve(HttpResponse.json({ data: [person()], totalElements: 1 })))
    expect(screen.queryByRole("option")).toBeNull()
  })
  it("never mounts search children when session expiry preceded mounting", async () => {
    sessionEvents.publish("session-expired")
    const reads = vi.fn(() => HttpResponse.json({}))
    renderProvider([http.get(READ, reads)])
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    expect(reads).not.toHaveBeenCalled()
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("heading", { name: NPI_MESSAGES.heading })).toBeNull()
  })
  it("does not expose search controls if expiry publishes between render and passive subscription", async () => {
    function ExpireDuringMount() {
      useLayoutEffect(() => sessionEvents.publish("session-expired"), [])
      return null
    }
    const loaded = vi.fn()
    renderInPage(<SWRConfig value={{ onSuccess: loaded }}><ProviderTab /><ExpireDuringMount /></SWRConfig>, { page: "account" })
    expect(sessionEvents.hasPublished("session-expired")).toBe(true)
    // The opening effect also checks the published event before starting a read.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    expect(loaded).not.toHaveBeenCalled()
    expect(screen.queryAllByRole("combobox")).toHaveLength(0)
    expect(screen.queryByRole("heading", { name: NPI_MESSAGES.heading })).toBeNull()
  })
  it("only the registration key is cached, never query results or picks", async () => {
    const cache = new Map()
    renderInPage(<SWRConfig value={{ provider: () => cache }}><ProviderTab /></SWRConfig>, { page: "account", handlers: [http.get(SEARCH, () => HttpResponse.json({ data: [person()], totalElements: 1 }))] })
    await screen.findByRole("combobox", { name: NPI_MESSAGES.personalSearch })
    fireEvent.focus(personal())
    await screen.findByRole("option", { name: "1234567967, Ann77 Lee, Austin, TX" })
    fireEvent.keyDown(personal(), { key: "ArrowDown" })
    fireEvent.keyDown(personal(), { key: "Enter" })
    expect(personal()).toHaveProperty("value", "1234567967, Ann77 Lee, Austin, TX")
    expect([...cache.keys()]).toHaveLength(1)
    expect(JSON.stringify([...cache.values()])).not.toMatch(/Ann77|1234567967|"id":77/)
  })
})
