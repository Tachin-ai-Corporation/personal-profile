import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { server } from "../../test/server"
import { callApi, configureClient, getPortalUrl } from "./client"
import { __resetSessionEventsForTests, subscribe } from "./session-events"
import { __resetActivityForTests, lastActivityAt, subscribeActivity } from "./activity"

const URL_MYSELF = "http://localhost:3000/api/1h/v2/user/myself"
const BINDING = "test-binding"

let consoleSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  configureClient({ sessionBinding: BINDING, portalUrl: "https://portal.example/applications" })
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  __resetSessionEventsForTests()
  configureClient({})
  consoleSpy.mockRestore()
  vi.restoreAllMocks()
})

/** Register a handler and capture the request it received. */
function capture(resolver: () => Response) {
  const seen: Request[] = []
  server.use(
    http.all(URL_MYSELF, ({ request }) => {
      seen.push(request.clone())
      return resolver()
    }),
  )
  return seen
}

describe("callApi — happy path", () => {
  it("resolves typed data, sends the binding, same-origin credentials and Accept", async () => {
    const seen = capture(() => HttpResponse.json({ id: 42, firstName: "Ada" }))
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const res = await callApi<{ id: number; firstName: string }>("user/fetchMyself", "/api/1h/v2/user/myself")

    expect(res).toEqual({ success: true, data: { id: 42, firstName: "Ada" }, statusCode: 200 })
    expect(seen).toHaveLength(1)
    expect(seen[0].headers.get("X-PP-Session")).toBe(BINDING)
    expect(seen[0].headers.get("Accept")).toBe("application/json")
    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("same-origin")
  })

  it("forces same-origin credentials even when the caller asks for include", async () => {
    capture(() => HttpResponse.json({}))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await callApi("t/creds", "/api/1h/v2/user/myself", { credentials: "include" })
    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("same-origin")
  })

  it("keeps a caller-supplied Accept", async () => {
    const seen = capture(() => HttpResponse.json({}))
    await callApi("t/accept", "/api/1h/v2/user/myself", { headers: { Accept: "image/png" } })
    expect(seen[0].headers.get("Accept")).toBe("image/png")
  })

  it("replaces a caller-supplied X-PP-Session with the registered binding", async () => {
    const seen = capture(() => HttpResponse.json({}))
    await callApi("t/forged", "/api/1h/v2/user/myself", { headers: { "x-pp-session": "forged" } })
    expect(seen[0].headers.get("X-PP-Session")).toBe(BINDING)
  })

  it("omits X-PP-Session (and drops a forged one) when no binding is registered", async () => {
    configureClient({})
    const seen = capture(() => HttpResponse.json({}))
    await callApi("t/nobinding", "/api/1h/v2/user/myself", { headers: { "X-PP-Session": "forged" } })
    expect(seen[0].headers.has("X-PP-Session")).toBe(false)
  })

  it("exposes the registered portal URL", () => {
    expect(getPortalUrl()).toBe("https://portal.example/applications")
  })
})

describe("callApi — empty and non-JSON 2xx", () => {
  it("204 → success with undefined data", async () => {
    capture(() => new HttpResponse(null, { status: 204 }))
    expect(await callApi("t/204", "/api/1h/v2/user/myself")).toEqual({
      success: true,
      data: undefined,
      statusCode: 204,
    })
  })

  it("200 empty body → success with undefined data", async () => {
    capture(() => new HttpResponse("", { status: 200 }))
    const res = await callApi("t/empty", "/api/1h/v2/user/myself")
    expect(res.success).toBe(true)
    expect(res.data).toBeUndefined()
  })

  it("200 bare text → data is the string", async () => {
    capture(() => HttpResponse.text("OK"))
    expect((await callApi("t/text", "/api/1h/v2/user/myself")).data).toBe("OK")
  })
})

describe("callApi — path guard", () => {
  it.each([
    "https://evil/x",
    "//evil/x",
    "api/x",
    "/foo",
    "",
    "/api",
    "/api/../launch",
    "/api/%2e%2e/x",
    "/api/./../x",
  ])("rejects %j without a network call", async (path) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await callApi("t/badpath", path)
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe("BAD_PATH")
    expect(res.statusCode).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("rejects a non-string path without throwing", async () => {
    const res = await callApi("t/badpath", 42 as unknown as string)
    expect(res.errorCode).toBe("BAD_PATH")
  })
})

describe("callApi — errors", () => {
  it("proxy error 502 UPSTREAM_ERROR → errorCode, statusCode, no event", async () => {
    const expired = vi.fn()
    const changed = vi.fn()
    subscribe("session-expired", expired)
    subscribe("session-changed", changed)
    capture(() => HttpResponse.json({ code: "UPSTREAM_ERROR" }, { status: 502 }))

    const res = await callApi("t/502", "/api/1h/v2/user/myself")

    expect(res).toMatchObject({ success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR" })
    expect(res.details).toBeUndefined()
    expect(expired).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it("backend 400 errorCode + details", async () => {
    const details = [{ field: "gender", value: "X" }]
    capture(() => HttpResponse.json({ errorCode: "INVALID_ENUM_VALUE", details }, { status: 400 }))
    const res = await callApi("t/400", "/api/1h/v2/user/myself")
    expect(res).toMatchObject({ success: false, statusCode: 400, errorCode: "INVALID_ENUM_VALUE", details })
  })

  it("prefers a string `code` over `errorCode`", async () => {
    capture(() => HttpResponse.json({ code: "A", errorCode: "B" }, { status: 400 }))
    expect((await callApi("t/code", "/api/1h/v2/user/myself")).errorCode).toBe("A")
  })

  it("ignores a numeric `code` and falls back to a string errorCode", async () => {
    capture(() => HttpResponse.json({ code: 400, errorCode: "DUPLICATE" }, { status: 400 }))
    expect((await callApi("t/num", "/api/1h/v2/user/myself")).errorCode).toBe("DUPLICATE")
  })

  it("ignores a numeric `code` alone", async () => {
    capture(() => HttpResponse.json({ message: "x", code: 400 }, { status: 400 }))
    const res = await callApi("t/num", "/api/1h/v2/user/myself")
    expect(res.errorCode).toBeUndefined()
    expect(res.statusCode).toBe(400)
  })

  it("500 text/html → no errorCode, generic error", async () => {
    capture(() => HttpResponse.html("<html>oops</html>", { status: 500 }))
    const res = await callApi("t/500", "/api/1h/v2/user/myself")
    expect(res.success).toBe(false)
    expect(res.statusCode).toBe(500)
    expect(res.errorCode).toBeUndefined()
    expect(res.error).toBe("t/500 failed (500)")
    expect(res.error).not.toContain("oops")
  })

  it("500 empty body → no errorCode, generic error", async () => {
    capture(() => new HttpResponse(null, { status: 500 }))
    const res = await callApi("t/500e", "/api/1h/v2/user/myself")
    expect(res).toMatchObject({ success: false, statusCode: 500, error: "t/500e failed (500)" })
    expect(res.errorCode).toBeUndefined()
  })

  it("never logs the response body", async () => {
    capture(() => HttpResponse.json({ code: "X", details: "SECRET-PHI" }, { status: 400 }))
    await callApi("t/log", "/api/1h/v2/user/myself")
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("SECRET-PHI")
  })

  it("network failure → NETWORK_ERROR, no statusCode, no throw", async () => {
    server.use(http.get(URL_MYSELF, () => HttpResponse.error()))
    const res = await callApi("t/net", "/api/1h/v2/user/myself")
    expect(res.success).toBe(false)
    expect(res.errorCode).toBe("NETWORK_ERROR")
    expect(res.statusCode).toBeUndefined()
  })

  it("invalid caller headers resolve to a failure instead of throwing", async () => {
    const res = await callApi("t/hdr", "/api/1h/v2/user/myself", { headers: { "bad header": "x" } })
    expect(res.success).toBe(false)
  })
})

describe("callApi — session events", () => {
  it("401 SESSION_EXPIRED twice → session-expired published once, both calls return the error", async () => {
    const cb = vi.fn()
    subscribe("session-expired", cb)
    capture(() => HttpResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 }))

    const a = await callApi("t/exp", "/api/1h/v2/user/myself")
    const b = await callApi("t/exp", "/api/1h/v2/user/myself")

    expect(cb).toHaveBeenCalledOnce()
    for (const res of [a, b]) {
      expect(res).toMatchObject({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    }
  })

  it("409 SESSION_CHANGED twice → session-changed published once", async () => {
    const cb = vi.fn()
    subscribe("session-changed", cb)
    capture(() => HttpResponse.json({ code: "SESSION_CHANGED" }, { status: 409 }))

    const a = await callApi("t/chg", "/api/1h/v2/user/myself")
    const b = await callApi("t/chg", "/api/1h/v2/user/myself")

    expect(cb).toHaveBeenCalledOnce()
    expect(a.errorCode).toBe("SESSION_CHANGED")
    expect(b.errorCode).toBe("SESSION_CHANGED")
  })

  it("401 TOKEN_EXPIRED runs a refresh; a 503 refresh resolves REFRESH_UNAVAILABLE with no event", async () => {
    const expired = vi.fn()
    const changed = vi.fn()
    subscribe("session-expired", expired)
    subscribe("session-changed", changed)
    capture(() => HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }))
    server.use(
      http.post("http://localhost:3000/api/session/refresh", () =>
        HttpResponse.json({ code: "REFRESH_UNAVAILABLE" }, { status: 503 }),
      ),
    )

    const res = await callApi("t/tok", "/api/1h/v2/user/myself")

    expect(res).toMatchObject({ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" })
    expect(expired).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it("a throwing subscriber does not break callApi", async () => {
    subscribe("session-expired", () => {
      throw new Error("boom")
    })
    capture(() => HttpResponse.json({ code: "SESSION_EXPIRED" }, { status: 401 }))
    const res = await callApi("t/throw", "/api/1h/v2/user/myself")
    expect(res.errorCode).toBe("SESSION_EXPIRED")
  })
})

describe("callApi — user activity header (Story 1.6)", () => {
  afterEach(() => {
    __resetActivityForTests()
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true })
  })

  it.each([
    ["POST", { method: "POST" }, "user"],
    ["put (lower-case)", { method: "put" }, "user"],
    ["DELETE", { method: "DELETE" }, "user"],
    ["GET userInitiated: true", { userInitiated: true }, "user"],
    ["plain GET", {}, null],
    ["GET userInitiated: false", { userInitiated: false }, null],
  ])("%s → X-PP-Activity %s", async (_label, init, expected) => {
    const seen = capture(() => HttpResponse.json({}))
    await callApi("t/act", "/api/1h/v2/user/myself", init)
    expect(seen[0].headers.get("X-PP-Activity")).toBe(expected)
  })

  it("a caller-supplied X-PP-Activity is removed on a non-user GET and normalized otherwise", async () => {
    const seen = capture(() => HttpResponse.json({}))
    await callApi("t/forged", "/api/1h/v2/user/myself", { headers: { "X-PP-Activity": "user" } })
    await callApi("t/odd", "/api/1h/v2/user/myself", { method: "POST", headers: { "x-pp-activity": "bogus" } })
    expect(seen[0].headers.get("X-PP-Activity")).toBeNull()
    expect(seen[1].headers.get("X-PP-Activity")).toBe("user")
  })

  it("userInitiated is stripped before fetch", async () => {
    capture(() => HttpResponse.json({}))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await callApi("t/strip", "/api/1h/v2/user/myself", { userInitiated: true })
    const init = fetchSpy.mock.calls[0][1] as Record<string, unknown>
    expect("userInitiated" in init).toBe(false)
  })

  it("the refresh POST never carries it; the replay carries the original's header", async () => {
    let calls = 0
    const seen = capture(() =>
      ++calls === 1 ? HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }) : HttpResponse.json({ ok: 1 }),
    )
    const refreshes: Request[] = []
    server.use(
      http.post("http://localhost:3000/api/session/refresh", ({ request }) => {
        refreshes.push(request.clone())
        return HttpResponse.json({})
      }),
    )
    const res = await callApi("t/replay", "/api/1h/v2/user/myself", { userInitiated: true })
    expect(res.success).toBe(true)
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0].headers.get("X-PP-Activity")).toBeNull()
    expect(seen).toHaveLength(2)
    expect(seen.map((r) => r.headers.get("X-PP-Activity"))).toEqual(["user", "user"])
  })

  it("a plain GET replay carries no header either", async () => {
    let calls = 0
    const seen = capture(() =>
      ++calls === 1 ? HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }) : HttpResponse.json({}),
    )
    server.use(http.post("http://localhost:3000/api/session/refresh", () => HttpResponse.json({})))
    await callApi("t/replay-bg", "/api/1h/v2/user/myself")
    expect(seen.map((r) => r.headers.get("X-PP-Activity"))).toEqual([null, null])
  })
})

describe("callApi — X-PP-Activity-At echo (Story 1.6)", () => {
  afterEach(() => __resetActivityForTests())

  it("a numeric echo → noteActivity(t)", async () => {
    const cb = vi.fn()
    subscribeActivity(cb)
    capture(() => HttpResponse.json({}, { headers: { "X-PP-Activity-At": "1800000000123" } }))
    await callApi("t/echo", "/api/1h/v2/user/myself", { userInitiated: true })
    expect(lastActivityAt()).toBe(1_800_000_000_123)
    expect(cb).toHaveBeenCalledWith(1_800_000_000_123)
  })

  it("an echo on an error response still counts", async () => {
    capture(() => HttpResponse.json({ code: "X" }, { status: 404, headers: { "X-PP-Activity-At": "42" } }))
    await callApi("t/echo404", "/api/1h/v2/user/myself", { method: "POST" })
    expect(lastActivityAt()).toBe(42)
  })

  it.each([["abc"], ["12x"], [""], ["-5"], ["1.5"]])("a non-numeric echo %j is ignored", async (value) => {
    const cb = vi.fn()
    subscribeActivity(cb)
    capture(() => HttpResponse.json({}, { headers: { "X-PP-Activity-At": value } }))
    await callApi("t/bad-echo", "/api/1h/v2/user/myself")
    expect(lastActivityAt()).toBe(0)
    expect(cb).not.toHaveBeenCalled()
  })

  it("no echo → no activity", async () => {
    capture(() => HttpResponse.json({}))
    await callApi("t/none", "/api/1h/v2/user/myself", { method: "POST" })
    expect(lastActivityAt()).toBe(0)
  })
})

describe("background reads are not activity (Story 1.6)", () => {
  it("fetchMyself and the SWR fetcher send no X-PP-Activity", async () => {
    const { fetchMyself } = await import("./user")
    const { fetcher } = await import("./fetcher")
    const { keys } = await import("./keys")
    const seen = capture(() => HttpResponse.json({ id: 1, personId: 2 }))
    await fetchMyself()
    await fetcher(keys.myself())
    expect(seen).toHaveLength(2)
    expect(seen.map((r) => r.headers.get("X-PP-Activity"))).toEqual([null, null])
  })
})
