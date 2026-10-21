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
})
