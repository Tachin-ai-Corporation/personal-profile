import { describe, expect, it } from "vitest"
import { IMAGE_CONTENT_TYPES, peekStream, sniffImage } from "./image-sniff"
import { IMAGES } from "@/test/image-fixture"

function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe("sniffImage", () => {
  it.each([
    ["png", IMAGES.png, "png"],
    ["jpeg", IMAGES.jpeg, "jpeg"],
    ["bmp", IMAGES.bmp, "bmp"],
    ["webp", IMAGES.webp, "webp"],
    ["svg", IMAGES.svg, null],
    ["html", IMAGES.html, null],
    ["gif", IMAGES.gif, null],
    ["RIFF but not WEBP (wav)", IMAGES.wav, null],
    ["a truncated PNG signature", IMAGES.png.slice(0, 5), null],
    ["empty", new Uint8Array(0), null],
  ])("%s → %s", (_label, bytes, kind) => {
    expect(sniffImage(bytes)).toBe(kind)
  })

  it("maps each kind to its content type", () => {
    expect(IMAGE_CONTENT_TYPES).toEqual({ png: "image/png", jpeg: "image/jpeg", bmp: "image/bmp", webp: "image/webp" })
  })
})

describe("peekStream", () => {
  it("collects the head across small chunks and replays the whole body", async () => {
    const body = IMAGES.png
    const peek = await peekStream(stream(body.slice(0, 3), body.slice(3, 9), body.slice(9, 20), body.slice(20)))
    if (peek.kind !== "ok") throw new Error("expected ok")
    expect(sniffImage(peek.head)).toBe("png")
    expect(new Uint8Array(await new Response(peek.body).arrayBuffer())).toEqual(body)
  })

  it("handles a body shorter than the head and an empty body", async () => {
    const short = await peekStream(stream(new Uint8Array([1, 2])))
    if (short.kind !== "ok") throw new Error("expected ok")
    expect(short.head).toEqual(new Uint8Array([1, 2]))
    expect(new Uint8Array(await new Response(short.body).arrayBuffer())).toEqual(new Uint8Array([1, 2]))

    const empty = await peekStream(stream())
    if (empty.kind !== "ok") throw new Error("expected ok")
    expect(empty.head.byteLength).toBe(0)
    expect((await new Response(empty.body).arrayBuffer()).byteLength).toBe(0)
  })

  it("reports an error while peeking", async () => {
    const broken = new ReadableStream<Uint8Array>({ start: (c) => c.error(new Error("reset")) })
    expect(await peekStream(broken)).toEqual({ kind: "error" })
  })

  it("passes on an error after the head and a cancel", async () => {
    let step = 0
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        step += 1
        if (step === 1) controller.enqueue(IMAGES.png)
        else controller.error(new Error("late reset"))
      },
    })
    const peek = await peekStream(failing)
    if (peek.kind !== "ok") throw new Error("expected ok")
    await expect(new Response(peek.body).arrayBuffer()).rejects.toThrow("late reset")

    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(IMAGES.jpeg),
      cancel: () => {
        cancelled = true
      },
    })
    const open = await peekStream(endless)
    if (open.kind !== "ok") throw new Error("expected ok")
    await open.body.cancel()
    expect(cancelled).toBe(true)
  })
})
