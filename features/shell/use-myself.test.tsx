import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import useSWR, { SWRConfig, useSWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { keys, registerFetcher } from "@/lib/api"
import { unregisterFetcher } from "@/lib/api/fetcher"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { setTestUrl } from "@/test/next-navigation"
import { testIdle } from "@/test/providers"
import { resetLeaveState } from "./leave"
import { PageFrame } from "./page-frame"
import { PortalUrlProvider } from "./portal-url-provider"
import { SwrProvider } from "./swr-provider"
import { MYSELF_RETRY_COUNT, useMyself } from "./use-myself"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

/**
 * The `myself` auto-retry (human decision 2026-10-14, main's
 * `shouldRetryMyself`): 5xx and network errors are retried with backoff,
 * never a 4xx; the error (and the Retry UI) shows only once the retries are
 * exhausted. The real root `SwrProvider`, with a short backoff base.
 */
const MYSELF = "/api/1h/v2/user/myself"
const LOAD_ERROR = "Something went wrong while loading profile information"
const upstream502 = () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })

function Providers({ children, retries }: { readonly children: ReactNode; readonly retries?: number }) {
  return (
    <SwrProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryInterval: 5, ...(retries === undefined ? {} : { errorRetryCount: retries }) }}>
        <PortalUrlProvider portalUrl="https://portal.test">{children}</PortalUrlProvider>
      </SWRConfig>
    </SwrProvider>
  )
}

function failing(times: number, failure: () => Response = upstream502) {
  let calls = 0
  server.use(
    http.get(MYSELF, () => {
      calls += 1
      return calls <= times ? failure() : HttpResponse.json(myselfWire({ firstName: "Ann", lastName: "Lee" }))
    }),
  )
  return () => calls
}

const wrapper = ({ children }: { readonly children: ReactNode }) => <Providers>{children}</Providers>

beforeEach(() => {
  resetLeaveState()
  setTestUrl("/?tab=contacts")
})

describe("useMyself auto-retry", () => {
  it("retries a 5xx with backoff and loads, never reporting the error in between", async () => {
    const calls = failing(2)
    const errors: unknown[] = []
    const { result } = renderHook(() => {
      const state = useMyself()
      if (state.error) errors.push(state.error)
      return state
    }, { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.myself?.firstName).toBe("Ann"))
    expect(calls()).toBe(3)
    expect(errors).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it("retries a network error", async () => {
    const calls = failing(1, () => HttpResponse.error())
    const { result } = renderHook(() => useMyself(), { wrapper })
    await waitFor(() => expect(result.current.myself?.firstName).toBe("Ann"))
    expect(calls()).toBe(2)
  })

  it.each([
    ["403", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 })],
    ["404", () => HttpResponse.json({ message: "Nope" }, { status: 404 })],
    ["409", () => HttpResponse.json({ message: "Conflict" }, { status: 409 })],
  ])("never retries a %s: one request, the error at once", async (_status, failure) => {
    const calls = failing(10, failure)
    const { result } = renderHook(() => useMyself(), { wrapper })
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.isLoading).toBe(false)
    // Give a (wrongly) scheduled retry time to fire.
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
    expect(calls()).toBe(1)
  })

  it(`stops after ${MYSELF_RETRY_COUNT} retries, then shows the error (and only then)`, async () => {
    const calls = failing(100)
    const { result } = renderHook(() => useMyself(), { wrapper })
    await waitFor(() => expect(result.current.error).toBeDefined(), { timeout: 3000 })
    expect(calls()).toBe(1 + MYSELF_RETRY_COUNT)
    expect(result.current.error?.response.statusCode).toBe(502)
    expect(result.current.isLoading).toBe(false)
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
    expect(calls()).toBe(1 + MYSELF_RETRY_COUNT)
  })

  it("honours a smaller errorRetryCount from the SWR config", async () => {
    const calls = failing(100)
    const { result } = renderHook(() => useMyself(), { wrapper: ({ children }) => <Providers retries={1}>{children}</Providers> })
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(calls()).toBe(2)
  })

  it("shows the page's Retry UI after the retries are exhausted; Retry loads", async () => {
    let fail = true
    let calls = 0
    server.use(
      http.get(MYSELF, () => {
        calls += 1
        return fail ? upstream502() : HttpResponse.json(myselfWire())
      }),
    )
    render(
      <Providers>
        <PageFrame page="profile" header={<div />} idle={testIdle()}>
          <div />
        </PageFrame>
      </Providers>,
    )
    expect(screen.queryByText(LOAD_ERROR)).toBeNull()
    expect(await screen.findByText(LOAD_ERROR, undefined, { timeout: 3000 })).toBeTruthy()
    expect(calls).toBe(1 + MYSELF_RETRY_COUNT)
    fail = false
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })))
    await waitFor(() => expect(screen.queryByText(LOAD_ERROR)).toBeNull())
  })

  it("keeps the loaded user when a later revalidation fails", async () => {
    let fail = false
    server.use(http.get(MYSELF, () => (fail ? upstream502() : HttpResponse.json(myselfWire({ firstName: "Ann" })))))
    const { result } = renderHook(
      () => {
        const { mutate } = useSWRConfig()
        return { ...useMyself(), revalidate: () => mutate(keys.myself()) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.myself?.firstName).toBe("Ann"))
    fail = true
    await act(async () => {
      await result.current.revalidate().catch(() => undefined)
    })
    await waitFor(() => expect(result.current.error).toBeDefined(), { timeout: 3000 })
    expect(result.current.myself?.firstName).toBe("Ann")
    expect(result.current.isLoading).toBe(false)
  })

  it("leaves every other key without automatic retries (root shouldRetryOnError: false)", async () => {
    let calls = 0
    const load = async () => {
      calls += 1
      throw new Error("boom")
    }
    registerFetcher("countries", load)
    try {
      const { result } = renderHook(() => useSWR(keys.countries()), { wrapper })
      await waitFor(() => expect(result.current.error).toBeDefined())
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
      expect(calls).toBe(1)
    } finally {
      unregisterFetcher("countries")
    }
  })
})
