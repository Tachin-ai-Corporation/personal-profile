import { beforeEach, describe, expect, it, vi } from "vitest"
import { canDecodeImage, fitWithin, reencodeImage, type ReencodeOptions } from "./image-reencode"

/**
 * The algorithm in jsdom (Story 1.10): `createImageBitmap` and the canvas are
 * stubbed, and the stub encoder's blob size is `width × height × bytes per
 * pixel` (by quality for JPEG). Real encoding (PNG/BMP/JPEG bytes in, JPEG
 * out, no EXIF) is proven in the browser by `e2e/profile-picture.spec.ts`.
 */

interface Encoded {
  readonly type: string
  readonly quality: number | undefined
  readonly width: number
  readonly height: number
}

const MB = 1024 * 1024
const JPEG: ReencodeOptions = { format: "jpeg", maxBytes: 4 * MB, maxDims: { width: 4096, height: 4096 } }

let encoded: Encoded[]
let fills: string[]
let draws: number[][]
/** Bytes per pixel the stub encoder produces, by quality (PNG: `undefined`). */
let bytesPerPixel: (quality: number | undefined) => number
let blobType: (requested: string) => string | null
let closed: number
/** Every canvas the code under test drew on. */
let canvases: Set<HTMLCanvasElement>

function stubBitmap(width: number, height: number, fails = false) {
  closed = 0
  const bitmap = { width, height, close: () => (closed += 1) }
  const create = vi.fn(async () => {
    if (fails) throw new DOMException("The source image could not be decoded.", "InvalidStateError")
    return bitmap
  })
  vi.stubGlobal("createImageBitmap", create)
  return create
}

beforeEach(() => {
  encoded = []
  fills = []
  draws = []
  canvases = new Set()
  bytesPerPixel = () => 0.5
  blobType = (requested) => requested
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.add(this)
    return {
      set fillStyle(value: string) {
        fills.push(value)
      },
      fillRect: () => undefined,
      drawImage: (_source: unknown, x: number, y: number, w: number, h: number) => draws.push([x, y, w, h]),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement["getContext"])
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
    const requested = type ?? "image/png"
    encoded.push({ type: requested, quality, width: this.width, height: this.height })
    const actual = blobType(requested)
    if (actual === null) return callback(null)
    const size = Math.round(this.width * this.height * bytesPerPixel(quality))
    callback(new Blob([new Uint8Array(size)], { type: actual }))
  })
})

const file = new Blob([new Uint8Array(8)], { type: "image/png" })

describe("fitWithin", () => {
  it("never upscales and fits the box in either orientation", () => {
    expect(fitWithin(300, 200, { width: 4096, height: 4096 })).toEqual({ width: 300, height: 200 })
    expect(fitWithin(8000, 4000, { width: 4096, height: 4096 })).toEqual({ width: 4096, height: 2048 })
    // A 2000 × 1000 box fits a portrait image as 1000 × 2000.
    expect(fitWithin(1000, 4000, { width: 2000, height: 1000 })).toEqual({ width: 500, height: 2000 })
    expect(fitWithin(4000, 1000, { width: 1000, height: 2000 })).toEqual({ width: 2000, height: 500 })
    expect(fitWithin(10000, 1, { width: 100, height: 100 })).toEqual({ width: 100, height: 1 })
  })
})

describe("reencodeImage", () => {
  it("re-encodes a small image at its own size with the first quality (on white)", async () => {
    const create = stubBitmap(600, 500)
    const result = await reencodeImage(file, JPEG)
    expect(result).toMatchObject({ ok: true, width: 600, height: 500 })
    expect(result.ok && result.blob.type).toBe("image/jpeg")
    expect(encoded).toEqual([{ type: "image/jpeg", quality: 0.92, width: 600, height: 500 }])
    expect(fills).toEqual(["white"])
    expect(draws).toEqual([[0, 0, 600, 500]])
    expect(create).toHaveBeenCalledWith(file)
    expect(closed).toBe(1)
  })

  it("steps the JPEG quality down (0.92, 0.85, 0.75, 0.6) before it scales", async () => {
    stubBitmap(1000, 1000)
    const sizes: Record<string, number> = { "0.92": 8, "0.85": 6, "0.75": 4.5, "0.6": 4 }
    bytesPerPixel = (quality) => sizes[String(quality)]
    const result = await reencodeImage(file, { ...JPEG, maxBytes: 4_000_000 })
    expect(encoded.map((e) => e.quality)).toEqual([0.92, 0.85, 0.75, 0.6])
    expect(result).toMatchObject({ ok: true, width: 1000, height: 1000 })
  })

  it("scales both sides by 0.8 per step once every quality is too large", async () => {
    stubBitmap(1000, 500)
    bytesPerPixel = () => 3
    const result = await reencodeImage(file, { ...JPEG, maxBytes: 3 * 640 * 320 })
    expect(encoded.map((e) => [e.width, e.height, e.quality])).toEqual([
      ...[0.92, 0.85, 0.75, 0.6].map((q) => [1000, 500, q]),
      ...[0.92, 0.85, 0.75, 0.6].map((q) => [800, 400, q]),
      [640, 320, 0.92],
    ])
    expect(result).toMatchObject({ ok: true, width: 640, height: 320 })
    // One canvas per size, each released (0 × 0) once done with, the last one too.
    expect(canvases.size).toBe(3)
    for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([0, 0])
  })

  it("first fits maxDims without upscaling", async () => {
    stubBitmap(8192, 4096)
    const result = await reencodeImage(file, { ...JPEG, maxBytes: 100 * MB })
    expect(result).toMatchObject({ ok: true, width: 4096, height: 2048 })
  })

  it("is TOO_LARGE when the next size would put the shorter side under 64 px", async () => {
    stubBitmap(200, 100)
    bytesPerPixel = () => 10
    const result = await reencodeImage(file, { ...JPEG, maxBytes: 10 })
    expect(result).toEqual({ ok: false, reason: "TOO_LARGE" })
    // 200×100 → 160×80 → 128×64; 102×51 would be under the floor.
    expect([...new Set(encoded.map((e) => `${e.width}x${e.height}`))]).toEqual(["200x100", "160x80", "128x64"])
    expect(closed).toBe(1)
    expect(canvases.size).toBe(3)
    for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([0, 0])
  })

  it("tries an image already under the floor once, at its own size", async () => {
    stubBitmap(40, 30)
    bytesPerPixel = () => 10
    expect(await reencodeImage(file, { ...JPEG, maxBytes: 10 })).toEqual({ ok: false, reason: "TOO_LARGE" })
    expect(new Set(encoded.map((e) => `${e.width}x${e.height}`))).toEqual(new Set(["40x30"]))
    stubBitmap(40, 30)
    expect(await reencodeImage(file, JPEG)).toMatchObject({ ok: true, width: 40, height: 30 })
  })

  it("PNG: no quality steps and no white background; scales by 0.8 per step", async () => {
    stubBitmap(2000, 1000)
    bytesPerPixel = () => 1
    const result = await reencodeImage(file, { format: "png", maxBytes: 1_100_000, maxDims: { width: 4096, height: 4096 } })
    expect(encoded).toEqual([
      { type: "image/png", quality: undefined, width: 2000, height: 1000 },
      { type: "image/png", quality: undefined, width: 1600, height: 800 },
      { type: "image/png", quality: undefined, width: 1280, height: 640 },
    ])
    expect(fills).toEqual([])
    expect(result.ok && result.blob.type).toBe("image/png")
    expect(result).toMatchObject({ ok: true, width: 1280, height: 640 })
  })

  it.each<[string, () => void]>([
    ["the decoder rejects the file", () => stubBitmap(10, 10, true)],
    ["the image has no pixels", () => stubBitmap(0, 10)],
    ["createImageBitmap is missing", () => vi.stubGlobal("createImageBitmap", undefined)],
  ])("is UNDECODABLE when %s", async (_label, arrange) => {
    arrange()
    expect(await reencodeImage(file, JPEG)).toEqual({ ok: false, reason: "UNDECODABLE" })
    expect(encoded).toEqual([])
  })

  it.each<[string, () => void]>([
    ["the canvas has no 2d context", () => vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)],
    ["toBlob gives no blob", () => (blobType = () => null)],
    ["the browser falls back to another type", () => (blobType = () => "image/png")],
    [
      "toBlob throws",
      () =>
        vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => {
          throw new Error("SecurityError")
        }),
    ],
    [
      "drawing throws",
      () =>
        vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation((() => {
          throw new Error("boom")
        }) as unknown as HTMLCanvasElement["getContext"]),
    ],
  ])("is UNDECODABLE (never throws) when %s", async (_label, arrange) => {
    stubBitmap(100, 100)
    arrange()
    expect(await reencodeImage(file, JPEG)).toEqual({ ok: false, reason: "UNDECODABLE" })
    expect(closed).toBe(1)
    for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([0, 0])
  })
})

describe("canDecodeImage", () => {
  it("is true for a decodable image (and releases it), false otherwise", async () => {
    stubBitmap(10, 10)
    expect(await canDecodeImage(file)).toBe(true)
    expect(closed).toBe(1)
    stubBitmap(10, 10, true)
    expect(await canDecodeImage(file)).toBe(false)
  })
})
