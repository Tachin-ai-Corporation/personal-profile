import { act, renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { sessionEvents } from "@/lib/api"
import { server } from "@/test/msw-server"
import { TestProviders } from "@/test/providers"
import { useOrganizations } from "./use-organizations"

const READ = "/api/1h/v2/user/organization/portal"
const page = { data: [{ tenantId: 1, enabledInTenant: true, organization: { name: "Alpha", type: [], personContacts: [] } }], pageNumber: 0, totalElements: 24, totalPages: 2 }

describe("organization query boundaries", () => {
  it("rejects current, invalid, unavailable and out-of-range pages without HTTP", async () => {
    const read = vi.fn(() => HttpResponse.json(page))
    server.use(http.get(READ, read))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    // No page exists yet, so even a plausible next page cannot start a read.
    act(() => result.current.setPage(1))
    await waitFor(() => expect(result.current.state).toBe("ready"))
    act(() => {
      for (const invalid of [0, -1, 0.5, Number.NaN, 10000, 2]) result.current.setPage(invalid)
    })
    expect(result.current.query).toEqual({ name: "", page: 0 })
    expect(read).toHaveBeenCalledTimes(1)
  })
  it("captured callbacks cannot revalidate after expiry, including before React renders the signal", async () => {
    const read = vi.fn(() => HttpResponse.json(page))
    server.use(http.get(READ, read))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    const beforeExpiry = result.current
    act(() => {
      sessionEvents.publish("session-expired")
      beforeExpiry.retry()
      beforeExpiry.setPage(1)
    })
    act(() => { result.current.retry(); result.current.setPage(1) })
    await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    expect(read).toHaveBeenCalledTimes(1)
    expect(result.current.state).toEqual({ error: { kind: "session" } })
    expect(result.current.query).toEqual({ name: "", page: 0 })
  })
  it("checks expiry before a queued debounce callback can request another query", async () => {
    const read = vi.fn(() => HttpResponse.json(page))
    server.use(http.get(READ, read))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      act(() => result.current.setText("next"))
      act(() => {
        sessionEvents.publish("session-expired")
        vi.advanceTimersByTime(500)
      })
      expect(result.current.query).toEqual({ name: "", page: 0 })
      expect(read).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it("a proxy-expired read uses the global session flow and cannot become ready", async () => {
    server.use(http.get(READ, () => HttpResponse.json({ source: "proxy", errorCode: "SESSION_EXPIRED" }, { status: 401 })))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toEqual({ error: { kind: "session" } }))
    expect(result.current.data).toBeUndefined()
  })
  it.each([98, 99])("keeps a complete emoji at the 100-unit boundary after %s ASCII units", async (asciiLength) => {
    const names: string[] = []
    server.use(http.get(READ, ({ request }) => {
      names.push(new URL(request.url).searchParams.get("name") ?? "")
      return HttpResponse.json(page)
    }))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    const prefix = "a".repeat(asciiLength)
    const expected = asciiLength === 98 ? `${prefix}😀` : prefix
    act(() => result.current.setText(`${prefix}😀`))
    expect(result.current.text).toBe(expected)
    expect(result.current.text.length).toBeLessThanOrEqual(100)
    await waitFor(() => expect(names).toEqual(["", expected]))
    expect(result.current.query.name).toBe(expected)
  })

  it("an obsolete recovery cannot settle a newer query's pending recovery", async () => {
    const requests: string[] = []
    const zeroReads = new Map<string, number>()
    const finish = new Map<string, (response: Response) => void>()
    server.use(http.get(READ, ({ request }) => {
      const q = new URL(request.url).searchParams
      const name = q.get("name") ?? ""
      const number = Number(q.get("page"))
      requests.push(`${name}:${number}`)
      if (number === 1) return HttpResponse.json({ ...page, data: [], pageNumber: 1, totalElements: 0, totalPages: 0 })
      const count = (zeroReads.get(name) ?? 0) + 1
      zeroReads.set(name, count)
      return count === 1 ? HttpResponse.json(page) : new Promise<Response>((done) => { finish.set(name, done) })
    }))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    act(() => result.current.setPage(1))
    await waitFor(() => expect(finish.has("")).toBe(true))
    act(() => result.current.setText("new"))
    await waitFor(() => {
      expect(result.current.query).toEqual({ name: "new", page: 0 })
      expect(result.current.state).toBe("ready")
    })
    act(() => result.current.setPage(1))
    await waitFor(() => expect(finish.has("new")).toBe(true))
    await act(async () => finish.get("")!(HttpResponse.json({ ...page, data: [], totalElements: 0, totalPages: 0 })))
    expect(result.current.query).toEqual({ name: "new", page: 0 })
    expect(result.current.state).toBe("loading")
    await act(async () => finish.get("new")!(HttpResponse.json({ ...page, data: [], totalElements: 0, totalPages: 0 })))
    await waitFor(() => expect(result.current.state).toBe("ready"))
    expect(result.current.data?.totalElements).toBe(0)
    expect(requests).toEqual([":0", ":1", ":0", "new:0", "new:1", "new:0"])
  })
  it("expiry prevents a pending forced recovery from restoring the result set", async () => {
    let calls = 0
    let finish!: (response: Response) => void
    server.use(http.get(READ, () => {
      calls++
      if (calls === 1) return HttpResponse.json(page)
      if (calls === 2) return HttpResponse.json({ ...page, data: [], pageNumber: 1, totalElements: 0, totalPages: 0 })
      return new Promise<Response>((done) => { finish = done })
    }))
    const { result } = renderHook(useOrganizations, { wrapper: TestProviders })
    await waitFor(() => expect(result.current.state).toBe("ready"))
    act(() => result.current.setPage(1))
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    act(() => sessionEvents.publish("session-expired"))
    await act(async () => finish(HttpResponse.json(page)))
    expect(result.current.state).toEqual({ error: { kind: "session" } })
    expect(result.current.data).toBeUndefined()
    expect(calls).toBe(3)
  })

})
