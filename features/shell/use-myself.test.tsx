import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import type { ReactNode } from "react"
import { SWRConfig, useSWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureClient } from "@/lib/api"
import { __resetSessionEventsForTests, subscribe } from "@/lib/api/session-events"
import { server } from "../../test/server"
import { MyselfName } from "./myself-name"
import { shouldRetryMyself, useMyself } from "./use-myself"
import { ApiError, keys } from "@/lib/api"

const URL_MYSELF = "http://localhost:3000/api/1h/v2/user/myself"

/** A fresh SWR cache per test; retries off unless a test opts in. */
function wrapperWith(config: Record<string, unknown> = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, ...config }}>{children}</SWRConfig>
    )
  }
}

let consoleSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  configureClient({ sessionBinding: "b", portalUrl: "https://portal.example/applications" })
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  __resetSessionEventsForTests()
  configureClient({})
  consoleSpy.mockRestore()
})

describe("useMyself / MyselfName", () => {
  it("renders the user's first and last name", async () => {
    server.use(
      http.get(URL_MYSELF, () => HttpResponse.json({ id: 42, personId: 7, firstName: "Ada", lastName: "Lovelace" })),
    )
    render(<MyselfName />, { wrapper: wrapperWith() })
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
  })

  it("maps the wire body, defaulting missing names to empty strings", async () => {
    server.use(http.get(URL_MYSELF, () => HttpResponse.json({ id: 42, personId: 7, firstName: "Ada" })))
    const { result } = renderHook(() => useMyself(), { wrapper: wrapperWith() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ id: 42, personId: 7, firstName: "Ada", lastName: "" })
  })

  it("renders nothing while loading and the name without a trailing space", async () => {
    server.use(http.get(URL_MYSELF, () => HttpResponse.json({ id: 1, personId: 1, firstName: "Ada" })))
    const { container } = render(<MyselfName />, { wrapper: wrapperWith() })
    expect(container).toBeEmptyDOMElement()
    const p = await screen.findByText("Ada", { exact: true })
    expect(p.textContent).toBe("Ada")
  })

  it("renders nothing when both names are missing", async () => {
    server.use(http.get(URL_MYSELF, () => HttpResponse.json({ id: 1, personId: 1 })))
    function Loaded() {
      const { data } = useMyself()
      return data ? <span data-testid="loaded" /> : null
    }
    const { container } = render(
      <>
        <div data-testid="name">
          <MyselfName />
        </div>
        <Loaded />
      </>,
      { wrapper: wrapperWith() },
    )
    await screen.findByTestId("loaded")
    expect(screen.getByTestId("name")).toBeEmptyDOMElement()
    expect(container.querySelector("p")).toBeNull()
  })

  it("keeps a loaded name when a later revalidation fails (TOKEN_EXPIRED + refresh unavailable)", async () => {
    let fail = false
    server.use(
      http.post("http://localhost:3000/api/session/refresh", () =>
        HttpResponse.json({ code: "REFRESH_UNAVAILABLE" }, { status: 503 }),
      ),
      http.get(URL_MYSELF, () =>
        fail
          ? HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 })
          : HttpResponse.json({ id: 1, personId: 1, firstName: "Ada", lastName: "Lovelace" }),
      ),
    )
    let revalidate: () => Promise<unknown> = async () => {}
    function Probe() {
      const { mutate } = useSWRConfig()
      const { error } = useMyself()
      revalidate = () => mutate(keys.myself())
      return <span data-testid="err">{error?.errorCode ?? ""}</span>
    }
    render(
      <>
        <MyselfName />
        <Probe />
      </>,
      { wrapper: wrapperWith() },
    )
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()

    fail = true
    await revalidate().catch(() => {})
    await waitFor(() => expect(screen.getByTestId("err").textContent).toBe("REFRESH_UNAVAILABLE"))
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument()
    expect(screen.queryByText("We couldn't load your name.")).not.toBeInTheDocument()
  })

  it("a 502 UPSTREAM_ERROR surfaces as an ApiError and the neutral error line, with no event", async () => {
    const expired = vi.fn()
    const changed = vi.fn()
    subscribe("session-expired", expired)
    subscribe("session-changed", changed)
    server.use(http.get(URL_MYSELF, () => HttpResponse.json({ code: "UPSTREAM_ERROR" }, { status: 502 })))

    const { result } = renderHook(() => useMyself(), { wrapper: wrapperWith() })
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.error?.name).toBe("ApiError")
    expect(result.current.error?.errorCode).toBe("UPSTREAM_ERROR")
    expect(result.current.error?.statusCode).toBe(502)
    expect(expired).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()

    render(<MyselfName />, { wrapper: wrapperWith() })
    expect(await screen.findByText("We couldn't load your name.")).toBeInTheDocument()
  })

  it("a 409 SESSION_CHANGED is terminal: one request and one publish even with retries enabled", async () => {
    const changed = vi.fn()
    subscribe("session-changed", changed)
    let calls = 0
    server.use(
      http.get(URL_MYSELF, () => {
        calls += 1
        return HttpResponse.json({ code: "SESSION_CHANGED" }, { status: 409 })
      }),
    )

    const { result } = renderHook(() => useMyself(), {
      wrapper: wrapperWith({ shouldRetryOnError: true, errorRetryInterval: 5, errorRetryCount: 2, dedupingInterval: 0 }),
    })
    await waitFor(() => expect(result.current.error?.errorCode).toBe("SESSION_CHANGED"))
    // Give any (wrongly) scheduled retry time to fire.
    await new Promise((r) => setTimeout(r, 200))
    expect(calls).toBe(1)
    expect(changed).toHaveBeenCalledOnce()
  })

  it("a 502 is transient and still retries", async () => {
    let calls = 0
    server.use(
      http.get(URL_MYSELF, () => {
        calls += 1
        return HttpResponse.json({ code: "UPSTREAM_ERROR" }, { status: 502 })
      }),
    )
    renderHook(() => useMyself(), {
      wrapper: wrapperWith({ shouldRetryOnError: true, errorRetryInterval: 5, errorRetryCount: 2, dedupingInterval: 0 }),
    })
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2), { timeout: 3000 })
  })

  it("shouldRetryMyself: 4xx and client-side codes are terminal; 5xx and network errors retry", () => {
    const e = (r: Partial<ConstructorParameters<typeof ApiError>[0]>) => new ApiError({ success: false, ...r })
    expect(shouldRetryMyself(e({ statusCode: 409, errorCode: "SESSION_CHANGED" }))).toBe(false)
    expect(shouldRetryMyself(e({ statusCode: 401, errorCode: "SESSION_EXPIRED" }))).toBe(false)
    expect(shouldRetryMyself(e({ statusCode: 403, errorCode: "CSRF" }))).toBe(false)
    expect(shouldRetryMyself(e({ errorCode: "BAD_PATH" }))).toBe(false)
    expect(shouldRetryMyself(e({ errorCode: "UNKNOWN_KEY" }))).toBe(false)
    expect(shouldRetryMyself(e({ statusCode: 502, errorCode: "UPSTREAM_ERROR" }))).toBe(true)
    expect(shouldRetryMyself(e({ errorCode: "NETWORK_ERROR" }))).toBe(true)
  })

  it("dedupes: two mounted consumers make one request", async () => {
    let calls = 0
    server.use(
      http.get(URL_MYSELF, () => {
        calls += 1
        return HttpResponse.json({ id: 1, personId: 1, firstName: "Ada", lastName: "Lovelace" })
      }),
    )
    render(
      <>
        <MyselfName />
        <MyselfName />
      </>,
      { wrapper: wrapperWith() },
    )
    expect(await screen.findAllByText("Ada Lovelace")).toHaveLength(2)
    expect(calls).toBe(1)
  })

  it("sends the registered binding when the hook fetches", async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get(URL_MYSELF, ({ request }) => {
        seen.push(request.headers.get("X-PP-Session"))
        return HttpResponse.json({ id: 1, personId: 1, firstName: "A", lastName: "B" })
      }),
    )
    const { result } = renderHook(() => useMyself(), { wrapper: wrapperWith() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(seen).toEqual(["b"])
  })
})
