import { describe, expect, it } from "vitest"
import { UpstreamBodyTimeoutError } from "./fetch-with-timeout"
import { readCapped, readStreamCapped } from "./read-capped"

/** A body delivered in chunks with no Content-Length (chunked transfer). */
function chunked(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

const bytes = (n: number) => new Uint8Array(n).fill(7)

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" } as RequestInit)
}

describe("readStreamCapped", () => {
  it("reads a null stream as empty", async () => {
    expect(await readStreamCapped(null, 10)).toEqual({ kind: "ok", bytes: new Uint8Array(0) })
  })

  it("accepts exactly the cap across chunks and stops one byte over it", async () => {
    const ok = await readStreamCapped(chunked(bytes(4), bytes(6)), 10)
    expect(ok.kind === "ok" && ok.bytes.byteLength).toBe(10)
    expect(await readStreamCapped(chunked(bytes(4), bytes(7)), 10)).toEqual({ kind: "too-large" })
  })

  it("reports a guarded body cut off by its timer as a timeout", async () => {
    const cut = new ReadableStream<Uint8Array>({ start: (c) => c.error(new UpstreamBodyTimeoutError()) })
    expect(await readStreamCapped(cut, 10)).toEqual({ kind: "timeout" })
  })

  it("reports a stream error", async () => {
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("reset")) })
    expect(await readStreamCapped(broken, 10)).toEqual({ kind: "error" })
  })
})

describe("readCapped", () => {
  it("returns the bytes of a body within the cap", async () => {
    const read = await readCapped(post("hello"), 5)
    expect(read.ok && new TextDecoder().decode(read.bytes)).toBe("hello")
  })

  it("reads a request without a body as empty", async () => {
    const read = await readCapped(new Request("http://localhost/x", { method: "POST" }), 5)
    expect(read.ok && read.bytes.byteLength).toBe(0)
  })

  it.each([
    ["over-cap Content-Length", { "Content-Length": "6" }, 413, "TOO_LARGE"],
    ["NaN Content-Length", { "Content-Length": "abc" }, 400, "BAD_BODY"],
    ["negative Content-Length", { "Content-Length": "-1" }, 400, "BAD_BODY"],
  ])("rejects a %s before reading", async (_label, headers, status, errorCode) => {
    expect(await readCapped(post("hi", headers), 5)).toEqual({ ok: false, status, errorCode })
  })

  it("rejects a chunked body over the cap while streaming (no Content-Length)", async () => {
    const request = post(chunked(bytes(3), bytes(3)))
    expect(request.headers.get("Content-Length")).toBeNull()
    expect(await readCapped(request, 5)).toEqual({ ok: false, status: 413, errorCode: "TOO_LARGE" })
  })

  it("rejects a body that lies about its length", async () => {
    expect(await readCapped(post(chunked(bytes(9)), { "Content-Length": "2" }), 5)).toEqual({ ok: false, status: 413, errorCode: "TOO_LARGE" })
  })

  it("answers BAD_BODY for a body that errors while reading", async () => {
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("aborted")) })
    expect(await readCapped(post(broken), 5)).toEqual({ ok: false, status: 400, errorCode: "BAD_BODY" })
  })
})
