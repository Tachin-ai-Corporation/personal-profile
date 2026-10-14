import { http, HttpResponse, delay } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { NO_STORE_HEADERS, withNoStore } from "./cache-headers"
import { discardBody, fetchWithTimeout } from "./fetch-with-timeout"
import { isJsonRequest } from "./content-type"
import { guardRoute } from "./guard-route"
import { jsonError, jsonOk, noContent, seeOther } from "./responses"
import { setLogSink } from "@/lib/server/log"

function expectNoStore(response: Response): void {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) expect(response.headers.get(name)).toBe(value)
}

describe("cache headers", () => {
  it("overwrites caching headers and drops upstream validators", () => {
    const headers = withNoStore(
      new Headers({ "Cache-Control": "public, max-age=600", ETag: "x", Expires: "y", "Last-Modified": "z" }),
    )
    expect(headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(headers.get("ETag")).toBeNull()
    expect(headers.get("Expires")).toBeNull()
    expect(headers.get("Last-Modified")).toBeNull()
    expect(withNoStore().get("Vary")).toBe("Cookie")
  })
})

describe("responses", () => {
  it("jsonError builds the BFF envelope with no-store", async () => {
    const response = jsonError(403, "NOT_ALLOWED", new Headers({ "Set-Cookie": "a=b" }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ errorCode: "NOT_ALLOWED", source: "proxy" })
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Set-Cookie")).toBe("a=b")
    expectNoStore(response)
    expectNoStore(jsonError(500, "INTERNAL_ERROR"))
  })

  it("jsonOk and noContent are no-store", async () => {
    const ok = jsonOk({ ok: true })
    expect(await ok.json()).toEqual({ ok: true })
    expectNoStore(ok)
    expectNoStore(jsonOk({}, new Headers()))
    const empty = noContent()
    expect(empty.status).toBe(204)
    expectNoStore(empty)
    expectNoStore(noContent(new Headers()))
  })

  it("seeOther answers 303 with an absolute Location", () => {
    const response = seeOther("https://app.example/x?tab=contacts")
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("https://app.example/x?tab=contacts")
    expectNoStore(response)
    expect(seeOther("http://localhost/", new Headers()).status).toBe(303)
  })

  it("seeOther refuses relative and non-http targets", () => {
    expect(() => seeOther("/relative")).toThrow()
    expect(() => seeOther("javascript:alert(1)")).toThrow("only http(s)")
  })
})

describe("fetchWithTimeout", () => {
  afterEach(() => vi.useRealTimers())

  const chunk = new TextEncoder().encode("partial")

  it("keeps the timeout armed while the body stalls, then errors the body", async () => {
    const stalled = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(chunk) })
    vi.stubGlobal("fetch", async () => new Response(stalled, { status: 200 }))
    const outcome = await fetchWithTimeout("https://upstream.test/stall", { method: "GET" }, 20)
    expect(outcome.kind).toBe("response")
    if (outcome.kind !== "response") return
    await expect(outcome.response.text()).rejects.toThrow()
  })

  it("clears the timer once the body is fully read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.stubGlobal("fetch", async () => new Response("done", { status: 200, headers: { "X-Up": "1" } }))
    const outcome = await fetchWithTimeout("https://upstream.test/ok", { method: "GET" })
    expect(vi.getTimerCount()).toBe(1)
    if (outcome.kind !== "response") throw new Error("expected a response")
    expect(outcome.response.headers.get("X-Up")).toBe("1")
    expect(await outcome.response.text()).toBe("done")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("clears the timer for a body-less response and when the body is cancelled", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }))
    await fetchWithTimeout("https://upstream.test/empty", { method: "GET" })
    expect(vi.getTimerCount()).toBe(0)
    vi.stubGlobal("fetch", async () => new Response("unread", { status: 200 }))
    const outcome = await fetchWithTimeout("https://upstream.test/unread", { method: "GET" })
    if (outcome.kind !== "response") throw new Error("expected a response")
    discardBody(outcome.response)
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("passes on a source body error and clears the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("reset")) })
    vi.stubGlobal("fetch", async () => new Response(broken, { status: 200 }))
    const outcome = await fetchWithTimeout("https://upstream.test/broken", { method: "GET" })
    if (outcome.kind !== "response") throw new Error("expected a response")
    await expect(outcome.response.text()).rejects.toThrow("reset")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("returns the response with manual redirects", async () => {
    server.use(http.get("https://upstream.test/a", () => new HttpResponse(null, { status: 302, headers: { Location: "/b" } })))
    const outcome = await fetchWithTimeout("https://upstream.test/a", { method: "GET" })
    expect(outcome.kind).toBe("response")
    if (outcome.kind === "response") expect(outcome.response.status).toBe(302)
  })

  it("reports a timeout", async () => {
    server.use(
      http.get("https://upstream.test/slow", async () => {
        await delay(200)
        return HttpResponse.json({})
      }),
    )
    expect(await fetchWithTimeout("https://upstream.test/slow", { method: "GET" }, 10)).toEqual({ kind: "timeout" })
  })

  it("reports a network error", async () => {
    server.use(http.get("https://upstream.test/down", () => HttpResponse.error()))
    expect(await fetchWithTimeout("https://upstream.test/down", { method: "GET" })).toEqual({ kind: "network" })
  })
})

describe("guardRoute", () => {
  it("passes results through", async () => {
    const route = guardRoute("/x", async () => new Response("ok"))
    expect(await (await route(new Request("http://localhost/x"))).text()).toBe("ok")
  })

  it("turns an unhandled error into a PHI-free 500", async () => {
    const lines: string[] = []
    const push = (l: string) => void lines.push(l)
    const restore = setLogSink({ info: push, warn: push, error: push })
    const boom = guardRoute("/x", async () => {
      throw new TypeError("secret detail")
    })
    const response = await boom(new Request("http://localhost/x"))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ errorCode: "INTERNAL_ERROR", source: "proxy" })
    const strange = guardRoute("/y", async () => {
      throw "not an error"
    })
    expect((await strange(new Request("http://localhost/y"))).status).toBe(500)
    restore()
    expect(lines[0]).toContain('"routeTemplate":"/x"')
    expect(lines[0]).toContain('"errorName":"TypeError"')
    expect(lines[0]).not.toContain("secret detail")
    expect(lines[1]).toContain('"errorName":"UnknownError"')
  })
})

describe("isJsonRequest", () => {
  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ["Application/JSON", true],
    ["application/jsonx", false],
    ["text/plain", false],
    [null, false],
  ])("%s → %s", (contentType, expected) => {
    const headers = contentType === null ? undefined : { "Content-Type": contentType }
    expect(isJsonRequest(new Request("http://localhost/x", { method: "POST", headers, body: "{}" }))).toBe(expected)
  })
})

describe("discardBody", () => {
  it("cancels an unread body and tolerates none", async () => {
    expect(() => discardBody(new Response("unread"))).not.toThrow()
    expect(() => discardBody(new Response(null))).not.toThrow()
  })
})
