import { beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage } from "@/components/ui/image-reencode"
import {
  checkInsuranceCardFile,
  INSURANCE_CARD_ACCEPT,
  INSURANCE_CARD_MAX_BYTES,
  INSURANCE_CARD_MAX_PIXELS,
  INSURANCE_CARD_REENCODE,
  insuranceCardFileType,
  insuranceCardPixelSize,
  insuranceChosenFileMeta,
} from "./card-file"

vi.mock("@/components/ui/image-reencode", async (original) => ({ ...(await original<object>()), reencodeImage: vi.fn() }))

/** Story 5.3: the card image checks (type, size, header dimensions) and the re-encode, before anything is uploaded. */

const be = (value: number, length: 2 | 4): number[] => Array.from({ length }, (_, index) => (value >> (8 * (length - 1 - index))) & 0xff)

/** A PNG signature and IHDR chunk declaring `width × height` (no image data: nothing is decoded before the re-encode). */
const pngHeader = (width: number, height: number): number[] => [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(width, 4), ...be(height, 4), 8, 2, 0, 0, 0, 0, 0, 0, 0,
]

/** A JPEG's SOI, optional segments before the frame header, then `SOF{sof}` declaring `width × height`. */
const jpegHeader = (width: number, height: number, { before = [] as number[][], sof = 0xc0 } = {}): number[] => [
  0xff,
  0xd8,
  ...before.flat(),
  0xff,
  sof,
  0,
  17,
  8,
  ...be(height, 2),
  ...be(width, 2),
  3,
  ...Array.from({ length: 9 }, () => 0),
]

/** A segment `FF {marker}` with `payload`. */
const segment = (marker: number, payload: number[]): number[] => [0xff, marker, ...be(payload.length + 2, 2), ...payload]
const EXIF = segment(0xe1, [...new TextEncoder().encode("Exif\0\0"), ...Array.from({ length: 300 }, (_, index) => index & 0xff)])

const PNG = pngHeader(1600, 1000)
const JPEG = jpegHeader(1600, 1000)

const file = (bytes: readonly number[], type: string, name = "card.png", size?: number): File => {
  const made = new File([new Uint8Array(bytes)], name, { type })
  if (size !== undefined) Object.defineProperty(made, "size", { value: size })
  return made
}

const ENCODED = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })

beforeEach(() => {
  vi.mocked(reencodeImage).mockReset()
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 100, height: 60 })
})

describe("card-file constants", () => {
  it("accepts PNG or JPEG in the picker; up to 10 MB, 6000 × 4000; re-encodes to a JPEG of at most 4 MB within 6000 px (RC11)", () => {
    expect(INSURANCE_CARD_ACCEPT).toBe("image/png,image/jpeg")
    expect(INSURANCE_CARD_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(INSURANCE_CARD_MAX_PIXELS).toEqual({ long: 6000, short: 4000 })
    expect(INSURANCE_CARD_REENCODE).toEqual({ format: "jpeg", maxBytes: 4 * 1024 * 1024, maxDims: { width: 6000, height: 6000 } })
  })
})

describe("insuranceCardFileType", () => {
  it.each([
    ["a PNG", file(PNG, "image/png"), "png"],
    ["a JPEG", file(JPEG, "image/jpeg", "a.jpg"), "jpeg"],
    ["a JPEG in upper case", file(JPEG, "IMAGE/JPEG", "a.jpg"), "jpeg"],
    ["a JPEG as image/jpg", file(JPEG, "image/jpg", "a.jpg"), "jpeg"],
    ["a JPEG as image/pjpeg", file(JPEG, "image/pjpeg", "a.jpg"), "jpeg"],
    ["a PNG without a MIME type (the bytes decide)", file(PNG, "", "a.png"), "png"],
    ["a JPEG without a MIME type", file(JPEG, "", "a"), "jpeg"],
  ])("%s is accepted", async (_name, candidate, type) => {
    expect(await insuranceCardFileType(candidate)).toBe(type)
  })

  it.each([
    ["an SVG", file([...new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")], "image/svg+xml", "card.svg")],
    ["an SVG without a MIME type", file([...new TextEncoder().encode("<svg/>")], "", "card.svg")],
    ["an SVG labelled PNG", file([...new TextEncoder().encode("<svg/>")], "image/png", "card.png")],
    ["a GIF", file([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif", "a.gif")],
    ["PNG bytes labelled GIF", file(PNG, "image/gif", "a.gif")],
    ["JPEG bytes labelled PNG", file(JPEG, "image/png")],
    ["a truncated PNG signature", file(PNG.slice(0, 4), "image/png")],
  ])("%s is refused", async (_name, candidate) => {
    expect(await insuranceCardFileType(candidate)).toBeNull()
  })

  it("a blob that can't be read is refused, never a throw", async () => {
    const broken = file(PNG, "image/png")
    Object.defineProperty(broken, "slice", { value: () => ({ arrayBuffer: () => Promise.reject(new Error("unreadable")) }) })
    expect(await insuranceCardFileType(broken)).toBeNull()
  })
})

describe("insuranceCardPixelSize (the header, no decode)", () => {
  it.each<[string, number[], "png" | "jpeg", { width: number; height: number } | null]>([
    ["a PNG IHDR", pngHeader(8000, 3000), "png", { width: 8000, height: 3000 }],
    ["a PNG without IHDR", [...PNG.slice(0, 12), 0x49, 0x44, 0x41, 0x54, ...PNG.slice(16)], "png", null],
    ["a truncated PNG", PNG.slice(0, 20), "png", null],
    ["a PNG declaring 0 × 10", pngHeader(0, 10), "png", null],
    ["a baseline JPEG (SOF0)", jpegHeader(1200, 760), "jpeg", { width: 1200, height: 760 }],
    ["an extended JPEG (SOF1)", jpegHeader(640, 480, { sof: 0xc1 }), "jpeg", { width: 640, height: 480 }],
    ["a progressive JPEG (SOF2)", jpegHeader(4000, 6000, { sof: 0xc2 }), "jpeg", { width: 4000, height: 6000 }],
    ["a JPEG with an EXIF APP1 and a DQT before SOF0", jpegHeader(3000, 8000, { before: [EXIF, segment(0xdb, Array.from({ length: 65 }, () => 1))] }), "jpeg", { width: 3000, height: 8000 }],
    ["a JPEG with fill bytes and a standalone marker before SOF0", jpegHeader(10, 20, { before: [[0xff, 0xff, 0xd0]] }), "jpeg", { width: 10, height: 20 }],
    ["a lossless JPEG (SOF3)", jpegHeader(10, 20, { sof: 0xc3 }), "jpeg", null],
    ["a JPEG whose scan starts before any SOF", [0xff, 0xd8, ...segment(0xda, [1, 2, 3])], "jpeg", null],
    ["a JPEG with a broken segment (no 0xFF)", [0xff, 0xd8, 0x12, 0x34], "jpeg", null],
    ["a JPEG with a segment length under 2", [0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0], "jpeg", null],
    ["a JPEG cut inside its SOF", jpegHeader(10, 20).slice(0, 8), "jpeg", null],
    ["a JPEG cut after a marker", [0xff, 0xd8, 0xff, 0xe0], "jpeg", null],
    ["a JPEG with no SOF at all", [0xff, 0xd8, ...EXIF], "jpeg", null],
  ])("%s", async (_name, bytes, type, expected) => {
    expect(await insuranceCardPixelSize(new Blob([new Uint8Array(bytes)]), type)).toEqual(expected)
  })
})

describe("insuranceChosenFileMeta", () => {
  it.each<[number, string]>([
    [300 * 1024, "front.png · 300 KB"],
    [1, "front.png · 1 KB"],
    [1023 * 1024, "front.png · 1023 KB"],
    [1024 * 1024, "front.png · 1.0 MB"],
    [2.41 * 1024 * 1024, "front.png · 2.5 MB"],
  ])("%i bytes → %s", (bytes, expected) => {
    expect(insuranceChosenFileMeta("front.png", bytes)).toBe(expected)
  })
})

describe("checkInsuranceCardFile (I/O rows: reject type / size / dims, re-encode fails)", () => {
  it("a valid PNG: re-encoded with the card options; the image carries the JPEG, the chosen name and size", async () => {
    const chosen = file(PNG, "image/png", "front.png", 2 * 1024 * 1024)
    expect(await checkInsuranceCardFile(chosen)).toEqual({ ok: true, image: { blob: ENCODED, name: "front.png", size: 2 * 1024 * 1024 } })
    expect(reencodeImage).toHaveBeenCalledWith(chosen, INSURANCE_CARD_REENCODE)
  })

  it("an SVG: \"{file} isn't a PNG or JPEG image.\"; nothing re-encoded", async () => {
    expect(await checkInsuranceCardFile(file([0x3c, 0x73], "image/svg+xml", "card.svg"))).toEqual({ ok: false, message: "card.svg isn't a PNG or JPEG image." })
    expect(reencodeImage).not.toHaveBeenCalled()
  })

  it("a 12 MB JPEG: \"{file} is 12.0 MB. Choose a file up to 10 MB.\"; exactly 10 MB passes", async () => {
    expect(await checkInsuranceCardFile(file(JPEG, "image/jpeg", "big.jpg", 12 * 1024 * 1024))).toEqual({ ok: false, message: "big.jpg is 12.0 MB. Choose a file up to 10 MB." })
    expect(reencodeImage).not.toHaveBeenCalled()
    expect((await checkInsuranceCardFile(file(JPEG, "image/jpeg", "ok.jpg", INSURANCE_CARD_MAX_BYTES))).ok).toBe(true)
  })

  it.each<[number, number, boolean]>([
    [8000, 3000, false],
    [3000, 8000, false],
    [6000, 4001, false],
    [4001, 6000, false],
    [6000, 4000, true],
    [4000, 6000, true],
    [1, 1, true],
  ])("%i × %i pixels → accepted %s (6000 × 4000 in either orientation, from the header, before any decode)", async (width, height, accepted) => {
    const result = await checkInsuranceCardFile(file(pngHeader(width, height), "image/png", "wide.png"))
    expect(result.ok).toBe(accepted)
    if (!accepted) {
      expect(result).toEqual({ ok: false, message: "wide.png is larger than 6000 × 4000 pixels." })
      expect(reencodeImage).not.toHaveBeenCalled()
    }
  })

  it("a JPEG declaring 8000 × 3000 after an EXIF segment is refused from its header", async () => {
    expect(await checkInsuranceCardFile(file(jpegHeader(8000, 3000, { before: [EXIF] }), "image/jpeg", "wide.jpg"))).toEqual({
      ok: false,
      message: "wide.jpg is larger than 6000 × 4000 pixels.",
    })
  })

  it.each([
    ["an unreadable header", () => file(PNG.slice(0, 16), "image/png", "broken.png"), false],
    ["the re-encode fails (an undecodable png)", () => {
      vi.mocked(reencodeImage).mockResolvedValue({ ok: false, reason: "UNDECODABLE" })
      return file(PNG, "image/png", "broken.png")
    }, true],
    ["the re-encode can't reach 4 MB", () => {
      vi.mocked(reencodeImage).mockResolvedValue({ ok: false, reason: "TOO_LARGE" })
      return file(PNG, "image/png", "broken.png")
    }, true],
  ])("%s: \"{file} couldn't be used. Choose another file.\"", async (_label, make, reencoded) => {
    expect(await checkInsuranceCardFile(make())).toEqual({ ok: false, message: "broken.png couldn't be used. Choose another file." })
    expect(vi.mocked(reencodeImage).mock.calls.length > 0).toBe(reencoded)
  })
})
