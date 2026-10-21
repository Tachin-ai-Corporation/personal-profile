import { http, HttpResponse, delay } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { server, trackAllRequests } from "@/test/msw-server"
import { activity as defaultActivity, createActivity, type Activity } from "./activity"
import { configureApiClient, createCallApi, getPortalUrl } from "./client"
import { mapApiError } from "./errors"
import { createPageUser, pageUser as defaultPageUser, type PageUser } from "./page-user"
import { createSessionEvents, type SessionEvents } from "./session-events"
import type { LockManagerLike } from "./refresh-coordinator"

const proxyError = (errorCode: string, status: number) => HttpResponse.json({ errorCode, source: "proxy" }, { status })

let events: SessionEvents
let published: string[]

function freshClient(locks?: () => LockManagerLike | undefined) {
  events = createSessionEvents()
  published = []
  events.subscribe("session-expired", () => published.push("session-expired"))
  return createCallApi({ events, locks: locks ?? (() => undefined) })
}

/**
 * A client whose page user is pinned (42) and whose `myself` check answers 42
 * (D-A): every write needs a pinned page user, or `callApi` blocks it. Call it
 * after the test's own handlers (its `myself` handler then wins).
 */
function writerClient() {
  server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 42 })))
  const user = createPageUser()
  user.pin(42)
  events = createSessionEvents()
  published = []
  events.subscribe("session-expired", () => published.push("session-expired"))
  return createCallApi({ events, locks: () => undefined, pageUser: user })
}

beforeEach(() => configureApiClient({ portalUrl: "https://portal.test" }))

describe("callApi NPI development logging privacy", () => {
  it.each([
    "/api/1h/v2/user/npi",
    "/api/1h/v2/public/npi/list?entityTypeCode=1&searchText=Private+Person&page=0&limit=10",
    "/api/1h/v2/public/npi/list?entityTypeCode=2&searchText=Private+Practice&page=1&limit=10",
    "/api/1h/v2/u\tser/npi?searchText=Private+Person",
    "/api/1h/v2/public/np\ni/list?searchText=Private+Person",
    "/api/1h/v2/user/npi\r?searchText=Private+Person",
    "/api/1h/v2/user/npi \t\r\n",
    "/api/1h/v2/user/.\t/npi?searchText=Private+Person",
    "/api/1h/v2/public/old/..\n/npi/list?searchText=Private+Practice",
    "/api/1h/v2/user/%2e\r/npi?searchText=Private+Person",
    "/api/1h/v2/public/npi/list\u0000\u001f ",
  ])("keeps queries and payloads out of real transport logs for %s", async (path) => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    const route = new URL(path, "http://localhost").pathname
    const call = freshClient()
    const privateBody = { id: 789, npi: 1234567890, name: "Private Person", practice: "Private Practice" }
    for (const status of [200, 403, 500]) {
      server.use(http.get(route, () => HttpResponse.json(privateBody, { status })))
      const response = await call("npi/read", path)
      expect(response.success).toBe(status === 200)
      if (status === 200) expect(response.data).toEqual(privateBody)
      expect(group).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`^\\[api\\] GET ${route} → ${status} \\(\\d+ ms\\)$`)))
    }
    server.use(http.get(route, () => HttpResponse.error()))
    expect(await call("npi/read", path)).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(group).toHaveBeenLastCalledWith(expect.stringContaining(`GET ${route} → network error`))
    expect(group).toHaveBeenCalledTimes(4)
    expect(end).toHaveBeenCalledTimes(4)
    expect(log).not.toHaveBeenCalled()
    expect(JSON.stringify(group.mock.calls)).not.toMatch(/searchText|Private|1234567890/)
  })

  it.each(["/api/1h/v2/user/npi", "/api/1h/v2/public/npi/list", "/api/1h/v2/user/.\t/npi", "/api/1h/v2/public/old/..\r/npi/list"])("preserves caller error metadata without logging sensitive error bodies for %s", async (path) => {
    const route = new URL(path, "http://localhost").pathname
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    const message = "Private Person 1234567890 at Private Practice"
    const cases = [
      {
        answer: () => HttpResponse.json({ message, code: 789, details: { name: "Private Person" } }, { status: 400 }),
        expected: { success: false, statusCode: 400, error: message, platformMessage: message, upstreamCode: 789, details: { name: "Private Person" } },
        mapped: { kind: "generic", message },
      },
      {
        answer: () => HttpResponse.json({ message, code: 789 }, { status: 403 }),
        expected: { success: false, statusCode: 403, error: message, platformMessage: message, upstreamCode: 789 },
        mapped: { kind: "forbidden" },
      },
      {
        answer: () => HttpResponse.json({ errorCode: "NOT_ALLOWED", source: "proxy", message, retryable: false }, { status: 403 }),
        expected: { success: false, statusCode: 403, error: "npi/read failed (403)", errorCode: "NOT_ALLOWED", source: "proxy", userMessage: message, retryable: false },
        mapped: { kind: "generic" },
      },
      {
        answer: () => HttpResponse.text(message, { status: 500 }),
        expected: { success: false, statusCode: 500, error: "npi/read failed (500)" },
        mapped: { kind: "generic" },
      },
    ]
    for (const { answer, expected, mapped } of cases) {
      server.use(http.get(route, answer))
      const response = await freshClient()("npi/read", `${path}?searchText=Private+Person`)
      expect(response).toMatchObject(expected)
      expect(mapApiError("provider", response)).toEqual(mapped)
      expect(group).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`^\\[api\\] GET ${route} → ${expected.statusCode} \\(\\d+ ms\\)$`)))
    }
    expect(group).toHaveBeenCalledTimes(cases.length)
    expect(end).toHaveBeenCalledTimes(cases.length)
    expect(log).not.toHaveBeenCalled()
    expect(JSON.stringify(group.mock.calls)).not.toMatch(/searchText|Private|1234567890|NOT_ALLOWED|retryable/)
  })
})

describe("callApi transport", () => {
  it("sends same-origin, with no session-binding header (D5), and parses JSON", async () => {
    let seen: Request | undefined
    server.use(
      http.get("/api/1h/v2/user/myself", ({ request }) => {
        seen = request
        return HttpResponse.json({ id: 1 })
      }),
    )
    const res = await freshClient()("user/fetchMyself", "/api/1h/v2/user/myself")
    expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
    expect(seen?.headers.get("X-PP-Session")).toBeNull()
    expect(getPortalUrl()).toBe("https://portal.test")
    expect(seen?.headers.get("Accept")).toBe("application/json")
    expect(seen?.credentials).toBe("same-origin")
  })

  it("sets JSON content type for string bodies and keeps a caller Accept", async () => {
    let seen: Request | undefined
    server.use(
      http.post("/api/token", ({ request }) => {
        seen = request
        return HttpResponse.json({ ok: true })
      }),
    )
    await freshClient()("session/start", "/api/token", { method: "POST", body: "{}", headers: { Accept: "text/plain" } })
    expect(seen?.headers.get("Content-Type")).toBe("application/json")
    expect(seen?.headers.get("Accept")).toBe("text/plain")
  })

  it("rejects paths that are not same-origin /api/ without a network call", async () => {
    const call = freshClient()
    expect(await call("x", "https://evil.test/api/x")).toMatchObject({ success: false, errorCode: "BAD_PATH" })
    expect(await call("x", "/other")).toMatchObject({ success: false, errorCode: "BAD_PATH" })
  })

  // Ported from origin/main's path guard (spec R5-2).
  it.each([
    "https://evil/x",
    "//evil/x",
    "api/x",
    "/foo",
    "",
    "/api",
    "/api/../auth",
    "/api/%2e%2e/x",
    "/api/./../x",
    // Review fix 3: a dot segment that stays under /api/ would still reach another BFF route.
    "/api/1h/../session/logout",
    "/api/1h/./v2/user/myself",
    "/api/1h/%2E%2E/session/logout",
    "/api/1h/%2e/x",
    "/api/1h/.%2E/x",
    "/api/1h/..?x=1",
    "/api/1h\\..\\session/logout",
    "/api/1h/v2\\user",
  ])(
    "rejects %j without a network call",
    async (path) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      const res = await freshClient()("t/badpath", path)
      expect(res).toMatchObject({ success: false, errorCode: "BAD_PATH" })
      expect(res.statusCode).toBeUndefined()
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )

  it("still sends dots that are not whole segments, and dots in the query", async () => {
    server.use(http.get("/api/1h/v2/file/a.b..c", () => HttpResponse.json({ ok: 1 })))
    expect(await freshClient()("t/dots", "/api/1h/v2/file/a.b..c?next=../x")).toMatchObject({ success: true })
  })

  it("rejects a non-string path without throwing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    expect(await freshClient()("t/badpath", 42 as unknown as string)).toMatchObject({ success: false, errorCode: "BAD_PATH" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("forces same-origin credentials even when the caller asks for include", async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json({})))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await freshClient()("t/creds", "/api/1h/v2/user/myself", { credentials: "include" })
    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe("same-origin")
  })

  it("answers NETWORK_ERROR, without throwing or fetching, on invalid caller headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const res = await freshClient()("t/headers", "/api/1h/v2/user/myself", { headers: { "bad header": "x" } })
    expect(res).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(res.statusCode).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("treats an empty 2xx body as success without data", async () => {
    server.use(http.post("/api/session/logout", () => new HttpResponse(null, { status: 204 })))
    expect(await freshClient()("x", "/api/session/logout", { method: "POST" })).toEqual({ success: true, statusCode: 204 })
  })

  it("reports an unreadable 2xx body as a failure", async () => {
    server.use(http.get("/api/1h/x", () => new HttpResponse("<html>", { status: 200 })))
    expect(await freshClient()("ctx", "/api/1h/x")).toMatchObject({ success: false, statusCode: 200 })
  })

  it("resolves NETWORK_ERROR without a status on a network failure", async () => {
    server.use(http.get("/api/1h/x", () => HttpResponse.error()))
    const res = await freshClient()("ctx", "/api/1h/x")
    expect(res).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(res.statusCode).toBeUndefined()
  })

  it("resolves NETWORK_ERROR when the body fails mid-read", async () => {
    const broken = new ReadableStream({ start: (controller) => controller.error(new Error("reset")) })
    vi.stubGlobal("fetch", async () => new Response(broken, { status: 200 }))
    expect(await freshClient()("ctx", "/api/1h/x")).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })

  it("parses an upstream error into upstreamCode and message, publishing nothing", async () => {
    server.use(http.put("/api/1h/v2/user/edit", () => HttpResponse.json({ message: "Duplicate", code: 1409, details: { f: 1 } }, { status: 409 })))
    const res = await writerClient()("ctx", "/api/1h/v2/user/edit", { method: "PUT", body: "{}" })
    expect(res).toEqual({ success: false, statusCode: 409, error: "Duplicate", upstreamCode: 1409, platformMessage: "Duplicate", details: { f: 1 }, errorCode: undefined })
    expect(published).toEqual([])
  })

  it("parses a proxy error into errorCode", async () => {
    server.use(http.get("/api/1h/x", () => proxyError("UPSTREAM_ERROR", 502)))
    expect(await freshClient()("ctx", "/api/1h/x")).toMatchObject({ success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR" })
  })

  it("marks a proxy body with an unknown code as the proxy's, never upstream forbidden", async () => {
    server.use(http.get("/api/1h/x", () => proxyError("SOME_NEW_CODE", 403)))
    const res = await freshClient()("ctx", "/api/1h/x")
    expect(res).toMatchObject({ success: false, statusCode: 403, source: "proxy" })
    expect(res.errorCode).toBeUndefined()
    expect(mapApiError("page", res)).toEqual({ kind: "generic" })
  })

  it("keeps the user-safe message and retryable:false of an unknown-code proxy body", async () => {
    server.use(
      http.post("/api/token", () =>
        HttpResponse.json({ ok: false, errorCode: "SOME_NEW_CODE", source: "proxy", message: "safe copy", retryable: false }, { status: 400 }),
      ),
    )
    expect(await freshClient()("ctx", "/api/token", { method: "POST", body: "{}" })).toMatchObject({
      source: "proxy",
      userMessage: "safe copy",
      retryable: false,
    })
  })

  it("treats a 409 as an ordinary error and publishes nothing (no SESSION_CHANGED, D5)", async () => {
    server.use(http.get("/api/1h/x", () => HttpResponse.json({ message: "conflict", code: 7 }, { status: 409 })))
    expect(await freshClient()("ctx", "/api/1h/x")).toMatchObject({ statusCode: 409, upstreamCode: 7 })
    expect(published).toEqual([])
  })

  it("carries a BFF body's user-safe message and retryable:false", async () => {
    server.use(
      http.post("/api/token", () =>
        HttpResponse.json({ ok: false, errorCode: "WRONG_TENANT", source: "proxy", message: "safe copy", retryable: false }, { status: 403 }),
      ),
    )
    expect(await freshClient()("ctx", "/api/token", { method: "POST", body: "{}" })).toMatchObject({
      errorCode: "WRONG_TENANT",
      userMessage: "safe copy",
      retryable: false,
    })
  })

  it("publishes session-expired once for a proxy 401 SESSION_EXPIRED", async () => {
    server.use(http.get("/api/1h/x", () => proxyError("SESSION_EXPIRED", 401)))
    const call = freshClient()
    await call("ctx", "/api/1h/x")
    await call("ctx", "/api/1h/x")
    expect(published).toEqual(["session-expired"])
  })
})

describe("callApi refresh (AD-16)", () => {
  it.each(["read", "write-preflight"] as const)("aborts the %s caller waiting for shared refresh while another caller refreshes and replays", async (kind) => {
    let release!: (response: Response) => void
    let refreshCalls = 0
    let refreshed = false
    const hits: string[] = []
    server.use(
      http.post("/api/session/refresh", () => {
        refreshCalls++
        return new Promise<Response>((resolve) => { release = resolve })
      }),
      http.get("/api/1h/*", ({ request }) => {
        hits.push(new URL(request.url).pathname)
        return refreshed ? HttpResponse.json({ saved: true }) : proxyError("TOKEN_EXPIRED", 401)
      }),
    )
    const call = freshClient()
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, "addEventListener")
    const remove = vi.spyOn(controller.signal, "removeEventListener")
    if (kind === "write-preflight") defaultPageUser.pin(42)
    const canceled = kind === "read"
      ? call("canceled", "/api/1h/canceled", { signal: controller.signal })
      : call("canceled", "/api/1h/v2/user/edit", { method: "PUT", body: "{}", signal: controller.signal })
    await vi.waitFor(() => expect(refreshCalls).toBe(1))
    const surviving = call("surviving", "/api/1h/surviving")
    await vi.waitFor(() => expect(hits).toHaveLength(2))
    controller.abort()
    expect(await canceled).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(published).toEqual([])
    expect(remove.mock.calls.some(([name, listener]) => name === "abort" && add.mock.calls.some(([addedName, added]) => addedName === name && added === listener))).toBe(true)
    refreshed = true
    release(HttpResponse.json({ ok: true }))
    expect(await surviving).toMatchObject({ success: true, data: { saved: true } })
    expect(refreshCalls).toBe(1)
    expect(hits).toEqual([kind === "read" ? "/api/1h/canceled" : "/api/1h/v2/user/myself", "/api/1h/surviving", "/api/1h/surviving"])
    expect(published).toEqual([])
  })

  it("removes its abort listener after a shared refresh completes", async () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, "addEventListener")
    const remove = vi.spyOn(controller.signal, "removeEventListener")
    expiringUpstream()
    expect(await freshClient()("ctx", "/api/1h/x", { signal: controller.signal })).toMatchObject({ success: true })
    // Fetch installs its own listeners too: every explicitly removed listener
    // must have been registered, including the transport's refresh wait.
    expect(remove.mock.calls.filter(([name]) => name === "abort").length).toBeGreaterThan(0)
    for (const [name, listener] of remove.mock.calls) expect(add.mock.calls.some(([addedName, added]) => addedName === name && added === listener)).toBe(true)
  })

  it("does not refresh, replay or publish expiry when aborted as the expired response arrives", async () => {
    const controller = new AbortController()
    let hits = 0
    server.use(http.get("/api/1h/x", () => {
      hits++
      controller.abort()
      return proxyError("TOKEN_EXPIRED", 401)
    }))
    expect(await freshClient()("ctx", "/api/1h/x", { signal: controller.signal })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(hits).toBe(1)
    expect(published).toEqual([])
  })

  it("sends nothing for an already aborted caller", async () => {
    const controller = new AbortController()
    controller.abort()
    const requests = trackAllRequests()
    expect(await freshClient()("ctx", "/api/1h/x", { signal: controller.signal })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(requests()).toBe(0)
    expect(published).toEqual([])
  })

  it("keeps cancellation local when it arrives as the refresh lock is acquired", async () => {
    const controller = new AbortController()
    let refreshCalls = 0
    server.use(
      http.get("/api/1h/x", () => proxyError("TOKEN_EXPIRED", 401)),
      http.post("/api/session/refresh", () => { refreshCalls++; return HttpResponse.json({ ok: true }) }),
    )
    const locks: LockManagerLike = {
      request: (_name, callback) => {
        controller.abort()
        return callback()
      },
    }
    expect(await freshClient(() => locks)("ctx", "/api/1h/x", { signal: controller.signal })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    await vi.waitFor(() => expect(refreshCalls).toBe(1))
    expect(published).toEqual([])
  })

  it("does not write after cancellation during a successful identity check", async () => {
    const controller = new AbortController()
    let writes = 0
    server.use(http.put("/api/1h/v2/user/edit", () => { writes++; return HttpResponse.json({}) }))
    server.use(http.get("/api/1h/v2/user/myself", () => {
      controller.abort()
      return HttpResponse.json({ id: 42 })
    }))
    const user = createPageUser()
    user.pin(42)
    expect(await createCallApi({ pageUser: user })("ctx", "/api/1h/v2/user/edit", { method: "PUT", body: "{}", signal: controller.signal })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(writes).toBe(0)
  })

  it("aborts a held identity GET promptly without sending the guarded mutation", async () => {
    const controller = new AbortController()
    let release!: (response: Response) => void
    let writes = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => new Promise<Response>((resolve) => { release = resolve })),
      http.put("/api/1h/v2/user/edit", () => { writes++; return HttpResponse.json({}) }),
    )
    const user = createPageUser()
    user.pin(42)
    const call = createCallApi({ pageUser: user, events: createSessionEvents() })
    const pending = call("ctx", "/api/1h/v2/user/edit", { method: "PUT", body: "{}", signal: controller.signal })
    await vi.waitFor(() => expect(release).toBeTypeOf("function"))
    controller.abort()
    expect(await pending).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
    expect(writes).toBe(0)
    release(HttpResponse.json({ id: 42 }))
  })

  function expiringUpstream() {
    let refreshed = false
    let refreshCalls = 0
    const hits = new Map<string, number>()
    server.use(
      http.post("/api/session/refresh", async () => {
        refreshCalls += 1
        await delay(5)
        refreshed = true
        return HttpResponse.json({ ok: true })
      }),
      http.all("/api/1h/*", ({ request }) => {
        const key = `${request.method} ${new URL(request.url).pathname}`
        hits.set(key, (hits.get(key) ?? 0) + 1)
        return refreshed ? HttpResponse.json({ ok: key }) : proxyError("TOKEN_EXPIRED", 401)
      }),
    )
    return { refreshCalls: () => refreshCalls, hits }
  }

  it("10 concurrent calls across an expiry → exactly 1 refresh, all replayed once and succeed", async () => {
    const upstream = expiringUpstream()
    const call = freshClient()
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call("ctx", `/api/1h/item/${i}`)))
    expect(upstream.refreshCalls()).toBe(1)
    expect(results.every((r) => r.success)).toBe(true)
    for (const count of upstream.hits.values()) expect(count).toBe(2)
  })

  it("two tabs sharing navigator.locks → exactly 1 IdP refresh", async () => {
    let idpCalls = 0
    let refreshed = false
    server.use(
      http.post("/api/session/refresh", async () => {
        // The route answers 200 without the IdP when another tab already refreshed.
        if (!refreshed) {
          idpCalls += 1
          await delay(5)
          refreshed = true
        }
        return HttpResponse.json({ ok: true })
      }),
      http.get("/api/1h/*", () => (refreshed ? HttpResponse.json({}) : proxyError("TOKEN_EXPIRED", 401))),
    )
    let chain: Promise<unknown> = Promise.resolve()
    const sharedLocks: LockManagerLike = {
      request: <T,>(_name: string, callback: () => Promise<T>): Promise<T> => {
        const next = chain.then(callback)
        chain = next.catch(() => undefined)
        return next
      },
    }
    const tabA = freshClient(() => sharedLocks)
    const tabB = createCallApi({ events: createSessionEvents(), locks: () => sharedLocks })
    const results = await Promise.all([tabA("a", "/api/1h/a"), tabB("b", "/api/1h/b")])
    expect(results.every((r) => r.success)).toBe(true)
    expect(idpCalls).toBe(1)
  })

  it("replays a PUT once after a proxy TOKEN_EXPIRED", async () => {
    const upstream = expiringUpstream()
    const res = await writerClient()("ctx", "/api/1h/v2/user/edit", { method: "PUT", body: "{}" })
    expect(res.success).toBe(true)
    expect(upstream.hits.get("PUT /api/1h/v2/user/edit")).toBe(2)
  })

  it.each([
    ["502 UPSTREAM_ERROR", () => proxyError("UPSTREAM_ERROR", 502)],
    ["504 UPSTREAM_TIMEOUT", () => proxyError("UPSTREAM_TIMEOUT", 504)],
    ["an upstream 401 body without source", () => HttpResponse.json({ errorCode: "TOKEN_EXPIRED" }, { status: 401 })],
  ])("never replays a PUT answered by %s", async (_label, resolver) => {
    let puts = 0
    server.use(
      http.put("/api/1h/v2/user/edit", () => {
        puts += 1
        return resolver()
      }),
    )
    const res = await writerClient()("ctx", "/api/1h/v2/user/edit", { method: "PUT", body: "{}" })
    expect(res.success).toBe(false)
    expect(puts).toBe(1)
  })

  it("treats a replay that is TOKEN_EXPIRED again as SESSION_EXPIRED", async () => {
    server.use(
      http.post("/api/session/refresh", () => HttpResponse.json({ ok: true })),
      http.get("/api/1h/x", () => proxyError("TOKEN_EXPIRED", 401)),
    )
    const res = await freshClient()("ctx", "/api/1h/x")
    expect(res).toMatchObject({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    expect(published).toEqual(["session-expired"])
  })

  it("refresh 401 → session-expired published once, error to every waiting call", async () => {
    let refreshCalls = 0
    server.use(
      http.post("/api/session/refresh", () => {
        refreshCalls += 1
        return proxyError("SESSION_EXPIRED", 401)
      }),
      http.get("/api/1h/*", () => proxyError("TOKEN_EXPIRED", 401)),
    )
    const call = freshClient()
    const results = await Promise.all([call("a", "/api/1h/a"), call("b", "/api/1h/b"), call("c", "/api/1h/c")])
    expect(refreshCalls).toBe(1)
    expect(results.map((r) => r.errorCode)).toEqual(["SESSION_EXPIRED", "SESSION_EXPIRED", "SESSION_EXPIRED"])
    expect(published).toEqual(["session-expired"])
  })

  it("refresh 503 → REFRESH_UNAVAILABLE, no event, and the next TOKEN_EXPIRED tries again", async () => {
    let refreshCalls = 0
    server.use(
      http.post("/api/session/refresh", () => {
        refreshCalls += 1
        return proxyError("REFRESH_UNAVAILABLE", 503)
      }),
      http.get("/api/1h/x", () => proxyError("TOKEN_EXPIRED", 401)),
    )
    const call = freshClient()
    expect(await call("ctx", "/api/1h/x")).toEqual({ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" })
    await call("ctx", "/api/1h/x")
    expect(refreshCalls).toBe(2)
    expect(published).toEqual([])
  })

  // Ported from origin/main's client.refresh.test.ts (spec R5-2).
  describe("navigator.locks failure fallback", () => {
    function refreshOnce() {
      let refreshed = false
      let refreshCalls = 0
      let apiCalls = 0
      server.use(
        http.post("/api/session/refresh", () => {
          refreshCalls += 1
          refreshed = true
          return HttpResponse.json({ ok: true })
        }),
        http.get("/api/1h/x", () => {
          apiCalls += 1
          return refreshed ? HttpResponse.json({ id: 1 }) : proxyError("TOKEN_EXPIRED", 401)
        }),
      )
      return { refreshCalls: () => refreshCalls, apiCalls: () => apiCalls }
    }

    it("the lock rejects before running the callback → the refresh runs unlocked; the call succeeds", async () => {
      const upstream = refreshOnce()
      const request = vi.fn(async () => {
        throw new DOMException("locks unavailable", "InvalidStateError")
      })
      const res = await freshClient(() => ({ request }))("t/lockfail", "/api/1h/x")
      expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
      expect(request).toHaveBeenCalledOnce()
      expect(upstream.refreshCalls()).toBe(1)
    })

    it("the lock rejects after the callback produced a result → that result is used; the call succeeds", async () => {
      const upstream = refreshOnce()
      const request = async <T,>(_name: string, callback: () => Promise<T>): Promise<T> => {
        await callback()
        throw new DOMException("lock released abnormally", "AbortError")
      }
      const res = await freshClient(() => ({ request }))("t/lockfail-after", "/api/1h/x")
      expect(res).toEqual({ success: true, data: { id: 1 }, statusCode: 200 })
      expect(upstream.refreshCalls()).toBe(1)
      expect(upstream.apiCalls()).toBe(2)
    })

    it("the lock rejects after the callback ran but before its result → REFRESH_UNAVAILABLE, no event, no second refresh", async () => {
      const upstream = refreshOnce()
      let refreshDone: Promise<unknown> = Promise.resolve()
      const request = async <T,>(_name: string, callback: () => Promise<T>): Promise<T> => {
        refreshDone = callback()
        throw new DOMException("lock released abnormally", "AbortError")
      }
      const res = await freshClient(() => ({ request }))("t/lockfail-noresult", "/api/1h/x")
      await refreshDone
      expect(res).toMatchObject({ success: false, errorCode: "REFRESH_UNAVAILABLE" })
      expect(upstream.refreshCalls()).toBe(1)
      expect(upstream.apiCalls()).toBe(1)
      expect(published).toEqual([])
    })

    it("two concurrent TOKEN_EXPIRED while that orphaned refresh runs → one refresh; both answer REFRESH_UNAVAILABLE", async () => {
      let refreshCalls = 0
      server.use(
        http.post("/api/session/refresh", async () => {
          refreshCalls += 1
          await delay(50)
          return HttpResponse.json({ ok: true })
        }),
        http.get("/api/1h/a", () => proxyError("TOKEN_EXPIRED", 401)),
        // The second 401 arrives after the lock already failed, while the refresh still runs.
        http.get("/api/1h/b", async () => {
          await delay(15)
          return proxyError("TOKEN_EXPIRED", 401)
        }),
      )
      const request = vi.fn(async <T,>(_name: string, callback: () => Promise<T>): Promise<T> => {
        void callback()
        throw new DOMException("lock released abnormally", "AbortError")
      })
      const call = freshClient(() => ({ request: request as LockManagerLike["request"] }))
      const results = await Promise.all([call("a", "/api/1h/a"), call("b", "/api/1h/b")])
      expect(results.map((r) => r.errorCode)).toEqual(["REFRESH_UNAVAILABLE", "REFRESH_UNAVAILABLE"])
      expect(refreshCalls).toBe(1)
      expect(request).toHaveBeenCalledOnce()
      expect(published).toEqual([])
    })
  })

  it("uses navigator.locks by default when the browser has it", async () => {
    const request = vi.fn(<T,>(_name: string, callback: () => Promise<T>) => callback())
    vi.stubGlobal("navigator", { ...navigator, locks: { request } })
    server.use(
      http.post("/api/session/refresh", () => HttpResponse.json({ ok: true })),
      http.get("/api/1h/x", () => proxyError("TOKEN_EXPIRED", 401)),
    )
    const call = createCallApi({ events: createSessionEvents() })
    await call("ctx", "/api/1h/x")
    expect(request).toHaveBeenCalledWith("pp-refresh", expect.any(Function))
  })
})

describe("callApi user activity (Story 1.6)", () => {
  let activity: Activity

  /** Its writes go through the D-A check: a pinned page user (42) and a `myself` answering 42. */
  function activityClient() {
    activity = createActivity()
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 42 })))
    const user = createPageUser()
    user.pin(42)
    return createCallApi({ events: createSessionEvents(), locks: () => undefined, activity, pageUser: user })
  }

  function capture(method: "get" | "post" | "put" | "head" | "options", path: string, answer: () => Response = () => HttpResponse.json({})) {
    const seen: (string | null)[] = []
    server.use(
      http[method](path, ({ request }) => {
        seen.push(request.headers.get("X-PP-Activity"))
        return answer()
      }),
    )
    return seen
  }

  it.each([
    ["POST", { method: "POST", body: "{}" }, "user"],
    ["PUT (lower-case method)", { method: "put", body: "{}" }, "user"],
    ["GET with userInitiated: true", { userInitiated: true }, "user"],
    ["plain GET", {}, null],
    ["GET with userInitiated: false", { userInitiated: false }, null],
    ["GET with a caller-supplied header", { headers: { "X-PP-Activity": "user" } }, null],
    ["HEAD", { method: "HEAD" }, null],
    ["OPTIONS (lower-case)", { method: "options", headers: { "X-PP-Activity": "user" } }, null],
    ["HEAD with userInitiated: true", { method: "HEAD", userInitiated: true }, "user"],
  ] as const)("%s → X-PP-Activity %s", async (_label, init, expected) => {
    const method = (("method" in init ? init.method : "GET") as string).toLowerCase() as "get" | "post" | "put" | "head" | "options"
    const seen = capture(method, "/api/1h/x")
    await activityClient()("ctx", "/api/1h/x", init)
    expect(seen).toEqual([expected])
  })

  it("never passes userInitiated to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    capture("get", "/api/1h/x")
    await activityClient()("ctx", "/api/1h/x", { userInitiated: true })
    const init = fetchSpy.mock.calls[0][1] as Record<string, unknown>
    expect("userInitiated" in init).toBe(false)
  })

  it("the refresh POST never carries it; the replay carries the same header as the original", async () => {
    let refreshHeader: string | null = "unset"
    let refreshed = false
    const seen: (string | null)[] = []
    server.use(
      http.post("/api/session/refresh", ({ request }) => {
        refreshHeader = request.headers.get("X-PP-Activity")
        refreshed = true
        return HttpResponse.json({ ok: true })
      }),
      http.get("/api/1h/x", ({ request }) => {
        seen.push(request.headers.get("X-PP-Activity"))
        return refreshed ? HttpResponse.json({}) : proxyError("TOKEN_EXPIRED", 401)
      }),
    )
    expect((await activityClient()("ctx", "/api/1h/x", { userInitiated: true })).success).toBe(true)
    expect(refreshHeader).toBeNull()
    expect(seen).toEqual(["user", "user"])
  })

  it("a numeric X-PP-Activity-At echo is noted, on success and on error answers", async () => {
    const call = activityClient()
    const noted = vi.fn()
    activity.subscribe(noted)
    capture("post", "/api/session/ping", () => new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": "1800000000000" } }))
    await call("session/ping", "/api/session/ping", { method: "POST" })
    expect(activity.lastAt()).toBe(1_800_000_000_000)
    capture("put", "/api/1h/y", () => HttpResponse.json({ message: "Nope" }, { status: 409, headers: { "X-PP-Activity-At": "1800000000500" } }))
    await call("ctx", "/api/1h/y", { method: "PUT", body: "{}" })
    expect(activity.lastAt()).toBe(1_800_000_000_500)
    expect(noted).toHaveBeenCalledTimes(2)
  })

  it.each(["", "abc", "-5", "1.5", "12345678901234567"])("a malformed echo %j is ignored", async (value) => {
    const call = activityClient()
    capture("post", "/api/session/ping", () => new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": value } }))
    await call("session/ping", "/api/session/ping", { method: "POST" })
    expect(activity.lastAt()).toBe(0)
  })

  it("the app's callApi notes into the shared activity instance", async () => {
    capture("post", "/api/session/ping", () => new HttpResponse(null, { status: 204, headers: { "X-PP-Activity-At": "42" } }))
    await createCallApi({ events: createSessionEvents(), locks: () => undefined })("ping", "/api/session/ping", { method: "POST" })
    expect(defaultActivity.lastAt()).toBe(42)
  })
})

describe("callApi save safeguard (D-A, spec NG-9027)", () => {
  let user: PageUser
  let log: string[]

  /** A client whose page user is pinned to `pinned` (none when `null`). */
  function guardedClient(pinned: number | null = 42) {
    user = createPageUser()
    if (pinned !== null) user.pin(pinned)
    events = createSessionEvents()
    published = []
    events.subscribe("session-expired", () => published.push("session-expired"))
    return createCallApi({ events, locks: () => undefined, pageUser: user })
  }

  /** Logs every request as "METHOD path"; `myself` answers in turn (the last one repeats), every other call 200 `{}`. */
  function upstream(...myself: (() => Response)[]) {
    log = []
    let myselfCalls = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => {
        log.push("GET /api/1h/v2/user/myself")
        myselfCalls += 1
        return (myself[myselfCalls - 1] ?? myself[myself.length - 1] ?? (() => HttpResponse.json({ id: 42 })))()
      }),
      http.all("/api/*", ({ request }) => {
        log.push(`${request.method} ${new URL(request.url).pathname}`)
        return request.method === "HEAD" ? new HttpResponse(null, { status: 200 }) : HttpResponse.json({})
      }),
    )
  }

  const EDIT = "/api/1h/v2/user/edit"
  const put = { method: "PUT", body: "{}" } as const

  it("same user: one fresh myself GET, then the write, once", async () => {
    upstream(() => HttpResponse.json({ id: 42 }))
    const res = await guardedClient()("ctx", EDIT, put)
    expect(res).toMatchObject({ success: true, statusCode: 200 })
    expect(log).toEqual(["GET /api/1h/v2/user/myself", "PUT /api/1h/v2/user/edit"])
    expect(published).toEqual([])
  })

  it("another user: nothing sent, session-expired published once, SESSION_EXPIRED returned", async () => {
    upstream(() => HttpResponse.json({ id: 43 }))
    const call = guardedClient()
    expect(await call("ctx", EDIT, put)).toEqual({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    expect(await call("ctx", "/api/pp/file/7", { method: "DELETE" })).toEqual({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    expect(log).toEqual(["GET /api/1h/v2/user/myself", "GET /api/1h/v2/user/myself"])
    expect(published).toEqual(["session-expired"])
    expect(mapApiError("phone", await call("ctx", EDIT, put))).toEqual({ kind: "session" })
  })

  it.each([
    ["a network failure", () => HttpResponse.error(), { success: false, errorCode: "NETWORK_ERROR" }, { kind: "network" }],
    ["a 502", () => proxyError("UPSTREAM_ERROR", 502), { success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR" }, { kind: "network" }],
    ["a body without a numeric id", () => HttpResponse.json({}), { success: false }, { kind: "network" }],
  ] as const)("a check that fails with %s: nothing sent, the check's failure returned, no publish", async (_label, answer, expected, mapped) => {
    upstream(answer)
    const res = await guardedClient()("ctx", EDIT, put)
    expect(res).toMatchObject(expected)
    expect(mapApiError("phone", res)).toEqual(mapped)
    expect(log).toEqual(["GET /api/1h/v2/user/myself"])
    expect(published).toEqual([])
  })

  it("a check whose refresh finds the session expired: nothing sent, SESSION_EXPIRED published once by the check", async () => {
    upstream(() => proxyError("TOKEN_EXPIRED", 401))
    server.use(http.post("/api/session/refresh", () => proxyError("SESSION_EXPIRED", 401)))
    const res = await guardedClient()("ctx", EDIT, put)
    expect(res).toMatchObject({ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" })
    expect(log).toEqual(["GET /api/1h/v2/user/myself"])
    expect(published).toEqual(["session-expired"])
  })

  it.each([
    ["POST", "/api/1h/v2/user/contact-point"],
    ["put (lower-case)", "/api/1h/v2/x"],
    ["DELETE", "/api/pp/file/7"],
    ["POST", "/api/pp/mfa/validate?x=1"],
    ["PUT", "/api//1h/v2/user/edit"],
  ])("checks a %s to %s", async (method, path) => {
    upstream(() => HttpResponse.json({ id: 42 }))
    await guardedClient()("ctx", path, { method: method.split(" ")[0], body: "{}" })
    expect(log[0]).toBe("GET /api/1h/v2/user/myself")
    expect(log).toHaveLength(2)
  })

  it.each([
    ["a GET", "/api/1h/v2/x", { method: "GET" }],
    ["a userInitiated GET", "/api/1h/v2/x", { userInitiated: true }],
    ["a HEAD", "/api/1h/v2/x", { method: "HEAD" }],
    ["an OPTIONS", "/api/pp/practice-support", { method: "OPTIONS" }],
    ["the ping", "/api/session/ping", { method: "POST" }],
    ["the logout", "/api/session/logout", { method: "POST" }],
    ["the launch", "/api/token", { method: "POST", body: "{}" }],
    ["a Places call", "/api/places/autocomplete", { method: "POST", body: "{}" }],
  ] as const)("never checks %s", async (_label, path, init) => {
    upstream(() => HttpResponse.json({ id: 43 }))
    await guardedClient()("ctx", path, init)
    expect(log).toEqual([`${"method" in init ? init.method : "GET"} ${path}`])
    expect(published).toEqual([])
  })

  it("no pinned user yet (no myself ever loaded): nothing sent, a network failure (Retry); once pinned, the same write goes through", async () => {
    upstream(() => HttpResponse.json({ id: 42 }))
    const call = guardedClient(null)
    const res = await call("ctx", EDIT, put)
    expect(res).toEqual({ success: false, errorCode: "NETWORK_ERROR", error: "ctx failed (network)" })
    expect(mapApiError("phone", res)).toEqual({ kind: "network" })
    expect(await call("ctx", "/api/pp/file/7", { method: "DELETE" })).toMatchObject({ errorCode: "NETWORK_ERROR" })
    expect(log).toEqual([])
    expect(published).toEqual([])
    user.pin(42)
    expect((await call("ctx", EDIT, put)).success).toBe(true)
    expect(log).toEqual(["GET /api/1h/v2/user/myself", "PUT /api/1h/v2/user/edit"])
  })

  it("inside a verified batch: no per-write check; after it, checks again", async () => {
    upstream(() => HttpResponse.json({ id: 42 }))
    const call = guardedClient()
    await user.runVerified(async () => {
      await call("a", EDIT, put)
      await call("b", "/api/pp/file/7", { method: "DELETE" })
    })
    expect(log).toEqual(["PUT /api/1h/v2/user/edit", "DELETE /api/pp/file/7"])
    await call("c", EDIT, put)
    expect(log.slice(2)).toEqual(["GET /api/1h/v2/user/myself", "PUT /api/1h/v2/user/edit"])
  })

  it("defaults to the page-lifetime pageUser", async () => {
    upstream(() => HttpResponse.json({ id: 43 }))
    defaultPageUser.pin(42)
    const res = await createCallApi({ events: createSessionEvents(), locks: () => undefined })("ctx", EDIT, put)
    expect(res).toMatchObject({ errorCode: "SESSION_EXPIRED" })
    expect(log).toEqual(["GET /api/1h/v2/user/myself"])
  })
})
