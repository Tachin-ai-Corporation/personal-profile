import { http, HttpResponse, delay } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { forward } from "./forward"

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

describe("forward: bodies and image entries", () => {
  const base = { method: "POST" as const, accessToken: "t", requestId: "r" }

  it("sends a rebuilt FormData with its own multipart Content-Type, never the client's", async () => {
    let contentType: string | null = null
    server.use(
      http.post("https://1health.demo.1health.io/api/up", ({ request }) => {
        contentType = request.headers.get("Content-Type")
        return HttpResponse.json({ id: 1 })
      }),
    )
    const form = new FormData()
    form.append("file", new Blob([new Uint8Array([1])], { type: "image/png" }), "a.png")
    const request = new Request("http://localhost/api/1h/up", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=client" } })
    const result = await forward({ ...base, url: "https://1health.demo.1health.io/api/up", request, body: form })
    expect(result.kind === "response" && result.response.status).toBe(200)
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(contentType).not.toContain("boundary=client")
  })

  it("an image body that errors before its head arrives → 502 UPSTREAM_ERROR", async () => {
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("reset")) })
    vi.stubGlobal("fetch", async () => new Response(broken, { status: 200, headers: { "Content-Type": "image/jpeg" } }))
    const result = await forward({
      ...base,
      method: "GET",
      url: "https://1health.demo.1health.io/api/img",
      request: new Request("http://localhost/api/1h/img"),
      body: undefined,
      asImage: true,
    })
    vi.unstubAllGlobals()
    if (result.kind !== "response") throw new Error("expected a response")
    expect(result.response.status).toBe(502)
    expect(await result.response.json()).toEqual({ errorCode: "UPSTREAM_ERROR", source: "proxy" })
  })
})

describe("forward: the per-chunk idle timer (10 s of upstream silence)", () => {
  const CHUNK = new TextEncoder().encode("chunk")

  async function download(body: ReadableStream<Uint8Array>): Promise<Response> {
    vi.stubGlobal("fetch", async () => new Response(body, { status: 200, headers: { "Content-Type": "application/octet-stream" } }))
    const result = await forward({
      url: "https://1health.demo.1health.io/api/big",
      method: "GET",
      request: new Request("http://localhost/api/1h/big"),
      body: undefined,
      accessToken: "t",
      requestId: "r",
    })
    if (result.kind !== "response") throw new Error("expected a response")
    return result.response
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("a trickle (a chunk every 5 s, 40 s in all, past the 25 s deadline) completes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let sent = 0
    const trickle = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 5_000))
        sent += 1
        if (sent > 8) controller.close()
        else controller.enqueue(CHUNK)
      },
    })
    const response = await download(trickle)
    expect(response.status).toBe(200)
    const text = response.text()
    await vi.advanceTimersByTimeAsync(50_000)
    expect(await text).toBe("chunk".repeat(8))
  })

  it("a stall after the first chunk is cut off after ~10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let sent = 0
    const stall = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1
        if (sent === 1) controller.enqueue(CHUNK)
      },
    })
    const response = await download(stall)
    let failed = false
    const text = response.text().catch(() => {
      failed = true
    })
    await vi.advanceTimersByTimeAsync(9_900)
    expect(failed).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    await text
    expect(failed).toBe(true)
  })
})
