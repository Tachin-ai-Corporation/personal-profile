import { http, HttpResponse, delay } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { buildUpstreamUrl, forward } from "./forward"

describe("buildUpstreamUrl", () => {
  it("encodes each segment and the query with encodeURIComponent", () => {
    expect(buildUpstreamUrl("https://1health.demo.1health.io", ["v2", "user", "myself"], new URLSearchParams())).toBe(
      "https://1health.demo.1health.io/api/v2/user/myself",
    )
    expect(buildUpstreamUrl("https://1health.demo.1health.io", ["v2", "a b"], new URLSearchParams("q=a b&x=é"))).toBe(
      "https://1health.demo.1health.io/api/v2/a%20b?q=a%20b&x=%C3%A9",
    )
  })

  it("refuses anything that does not rebuild to the same origin and path", () => {
    expect(buildUpstreamUrl("https://1health.demo.1health.io", ["v2", ".."], new URLSearchParams())).toBeNull()
  })
})

describe("forward", () => {
  it("answers 504 UPSTREAM_TIMEOUT when upstream is too slow", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    server.use(
      http.get("https://1health.demo.1health.io/api/slow", async () => {
        await delay("infinite")
        return HttpResponse.json({})
      }),
    )
    const pending = forward({
      url: "https://1health.demo.1health.io/api/slow",
      method: "GET",
      request: new Request("http://localhost/api/1h/slow"),
      body: undefined,
      accessToken: "t",
      requestId: "r",
    })
    await vi.advanceTimersByTimeAsync(25_000)
    const result = await pending
    vi.useRealTimers()
    expect(result.kind).toBe("response")
    if (result.kind === "response") expect(result.response.status).toBe(504)
  })

  it("passes a 204 through without a body", async () => {
    server.use(http.get("https://1health.demo.1health.io/api/empty", () => new HttpResponse(null, { status: 204 })))
    const result = await forward({
      url: "https://1health.demo.1health.io/api/empty",
      method: "GET",
      request: new Request("http://localhost/api/1h/empty"),
      body: undefined,
      accessToken: "t",
      requestId: "r",
    })
    expect(result.kind === "response" && result.response.status).toBe(204)
  })
})
