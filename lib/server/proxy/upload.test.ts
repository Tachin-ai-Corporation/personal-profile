import { describe, expect, it } from "vitest"
import { IMAGES, imageOfSize } from "@/test/image-fixture"
import { multipart, multipartInit, type Part, type Transfer } from "@/test/multipart-fixture"
import type { UploadSpec } from "./types"
import { readUpload, sanitizeFileName, UPLOAD_OVERHEAD_BYTES } from "./upload"

const CAP = 1024
const SPEC: UploadSpec = { part: "file", types: ["png", "jpeg", "bmp"] }
const PNG_ONLY: UploadSpec = { part: "fileNewVersion", types: ["png"] }

async function upload(parts: readonly Part[], spec: UploadSpec = SPEC, transfer: Transfer = "header") {
  const payload = await multipart(parts)
  return readUpload(new Request("http://localhost/x", multipartInit(payload, transfer)), spec, CAP)
}

describe("readUpload (Story 1.10 table)", () => {
  it.each(["header", "chunked"] as const)("accepts a file of exactly the cap (%s) and rebuilds one typed, renamed part", async (transfer) => {
    const result = await upload([{ name: "file", bytes: imageOfSize("png", CAP), filename: "../My Photo!.jpeg", type: "image/jpeg" }], SPEC, transfer)
    if (!result.ok) throw new Error(`expected ok, got ${result.errorCode}`)
    const entries = [...result.form.entries()]
    expect(entries).toHaveLength(1)
    const [name, file] = entries[0]
    expect(name).toBe("file")
    if (typeof file === "string") throw new Error("expected a file")
    expect(file.type).toBe("image/png")
    expect(file.name).toBe("My_Photo_.png")
    expect(file.size).toBe(CAP)
  })

  it.each(["header", "chunked"] as const)("rejects cap + 1 byte with 413 (%s)", async (transfer) => {
    expect(await upload([{ name: "file", bytes: imageOfSize("png", CAP + 1) }], SPEC, transfer)).toEqual({ ok: false, status: 413, errorCode: "TOO_LARGE" })
  })

  it("rejects a declared Content-Length over cap + 16 KiB before reading", async () => {
    const payload = await multipart([{ name: "file", bytes: IMAGES.png }])
    const request = new Request("http://localhost/x", multipartInit(payload, "header"))
    const big = new Request(request, { headers: { "Content-Type": payload.contentType, "Content-Length": String(CAP + UPLOAD_OVERHEAD_BYTES + 1) } })
    expect(await readUpload(big, SPEC, CAP)).toEqual({ ok: false, status: 413, errorCode: "TOO_LARGE" })
  })

  it("rejects a chunked body over cap + 16 KiB while streaming", async () => {
    const result = await upload([{ name: "file", bytes: imageOfSize("png", CAP + UPLOAD_OVERHEAD_BYTES + 10) }], SPEC, "chunked")
    expect(result).toEqual({ ok: false, status: 413, errorCode: "TOO_LARGE" })
  })

  it.each([
    ["SVG renamed .png", [{ name: "file", bytes: IMAGES.svg, filename: "a.png" }]],
    ["HTML renamed .png", [{ name: "file", bytes: IMAGES.html, filename: "a.png" }]],
    ["GIF renamed .png", [{ name: "file", bytes: IMAGES.gif, filename: "a.png" }]],
    ["WebP (not an upload type)", [{ name: "file", bytes: IMAGES.webp, filename: "a.png" }]],
    ["two file parts", [{ name: "file", bytes: IMAGES.png }, { name: "file", bytes: IMAGES.png }]],
    ["a file plus a text field", [{ name: "file", bytes: IMAGES.png }, { name: "note", filename: false }]],
    ["a part named image", [{ name: "image", bytes: IMAGES.png }]],
    ["a text field named file", [{ name: "file", filename: false }]],
    ["no parts", []],
  ] as const)("rejects %s with 415", async (_label, parts) => {
    expect(await upload(parts)).toEqual({ ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" })
  })

  it("a PNG-only entry rejects a JPEG and accepts a PNG under its own part name", async () => {
    expect(await upload([{ name: "fileNewVersion", bytes: IMAGES.jpeg }], PNG_ONLY)).toEqual({ ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" })
    expect(await upload([{ name: "file", bytes: IMAGES.png }], PNG_ONLY)).toEqual({ ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" })
    expect((await upload([{ name: "fileNewVersion", bytes: IMAGES.png }], PNG_ONLY)).ok).toBe(true)
  })

  it.each([
    ["a JSON body", "application/json", JSON.stringify({ file: "x" })],
    ["no Content-Type", null, "x"],
    ["multipart without a boundary", "multipart/form-data", "x"],
    ["another multipart type", "multipart/mixed; boundary=abc", "x"],
    ["a body that is not multipart", "multipart/form-data; boundary=abc", "not a multipart body"],
  ])("rejects %s with 415", async (_label, contentType, body) => {
    const headers = contentType === null ? undefined : { "Content-Type": contentType }
    const request = new Request("http://localhost/x", { method: "POST", headers, body })
    if (contentType === null) request.headers.delete("Content-Type")
    expect(await readUpload(request, SPEC, CAP)).toEqual({ ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" })
  })
})

describe("sanitizeFileName", () => {
  it.each([
    ["photo.jpg", "jpeg", "photo.jpg"],
    ["C:\\\\Users\\\\ann\\\\scan.BMP", "bmp", "scan.bmp"],
    ["../../etc/passwd", "png", "passwd.png"],
    ["..png", "png", "file.png"],
    [".hidden.png", "png", "hidden.png"],
    ["ünïcødé photo.png", "png", "n_c_d__photo.png"],
    ["", "jpeg", "file.jpg"],
    [`${"a".repeat(200)}.png`, "png", `${"a".repeat(96)}.png`],
  ] as const)("%j as %s → %j", (name, kind, expected) => {
    expect(sanitizeFileName(name, kind)).toBe(expected)
  })
})
