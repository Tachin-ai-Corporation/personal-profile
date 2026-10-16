import { describe, expect, it } from "vitest"
import { SIGNATURE_ACCEPT, SIGNATURE_MAX_BYTES, SIGNATURE_PAD_SIZE, SIGNATURE_REENCODE, signatureFileType } from "./signature-file"

/** Story 2.4: what "Upload image instead" accepts and what every Signature is re-encoded to. */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00]

const file = (bytes: readonly number[], type: string, name = "sig"): File => new File([new Uint8Array(bytes)], name, { type })

describe("signature-file", () => {
  it("accepts PNG or JPEG in the picker; re-encodes to a PNG of at most 1 MB within 2× the 480 × 160 pad", () => {
    expect(SIGNATURE_ACCEPT).toBe("image/png,image/jpeg")
    // Pinned to the proxy's limit: `SIGNATURE_MAX_BYTES` in lib/server/proxy/allowlist/personal.ts (its test pins 1024 * 1024 too).
    expect(SIGNATURE_MAX_BYTES).toBe(1024 * 1024)
    expect(SIGNATURE_PAD_SIZE).toEqual({ width: 480, height: 160 })
    expect(SIGNATURE_REENCODE).toEqual({ format: "png", maxBytes: 1024 * 1024, maxDims: { width: 960, height: 320 } })
  })

  it("a PNG or a JPEG by MIME type and leading bytes is accepted (MIME in any case)", async () => {
    expect(await signatureFileType(file(PNG, "image/png", "a.png"))).toBe("png")
    expect(await signatureFileType(file(JPEG, "image/jpeg", "a.jpg"))).toBe("jpeg")
    expect(await signatureFileType(file(JPEG, "IMAGE/JPEG", "a.jpeg"))).toBe("jpeg")
  })

  it.each([
    ["a GIF", file([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "image/gif", "a.gif")],
    ["a renamed text file", file([...new TextEncoder().encode("just some text")], "image/png", "notes.png")],
    ["JPEG bytes labelled PNG", file(JPEG, "image/png", "a.png")],
    ["PNG bytes labelled JPEG", file(PNG, "image/jpeg", "a.jpg")],
    ["a truncated PNG header", file(PNG.slice(0, 4), "image/png", "a.png")],
    ["an empty file", file([], "image/png", "a.png")],
    ["no MIME type", file(PNG, "", "a.png")],
    ["a BMP", file([0x42, 0x4d, 0x00], "image/bmp", "a.bmp")],
  ])("%s is refused", async (_name, candidate) => {
    expect(await signatureFileType(candidate)).toBeNull()
  })

  it("a blob that can't be read is refused, never a throw", async () => {
    const broken = file(PNG, "image/png")
    Object.defineProperty(broken, "slice", { value: () => ({ arrayBuffer: () => Promise.reject(new Error("unreadable")) }) })
    expect(await signatureFileType(broken)).toBeNull()
  })
})
