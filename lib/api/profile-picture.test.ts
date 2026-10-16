import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { myselfWire } from "@/test/myself-fixture"
import { server } from "@/test/msw-server"
import {
  ApiResponseError,
  deleteProfilePictureFile,
  fetchMyself,
  fetchProfilePictureId,
  keys,
  loadProfilePictureId,
  profilePictureIdPath,
  profilePicturePreviewPath,
  profilePictureUploadName,
  profilePictureUploadPath,
  swrFetcher,
  toProfilePictureId,
  uploadProfilePicture,
} from "."

const ID_PATH = "/api/pp/profile-picture-id"

/** Profile picture (Team A, Stories 1.9–1.10). Team A adds its own cases here. */
describe("profile-picture", () => {
  it("paths", () => {
    expect(profilePictureIdPath()).toBe("/api/pp/profile-picture-id")
    expect(profilePictureUploadPath()).toBe("/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
  })

  it("profilePicturePreviewPath busts the cache with the file id, null without one (spec F7-2 review)", () => {
    expect(profilePicturePreviewPath(321)).toBe("/api/1h/v2/user/profile-picture/preview?v=321")
    expect(profilePicturePreviewPath("7")).toBe("/api/1h/v2/user/profile-picture/preview?v=7")
    for (const id of [null, undefined, 0, "", "x"]) expect(profilePicturePreviewPath(id)).toBeNull()
  })
})

describe("profile-picture-id loader (Story 1.9)", () => {
  it("maps a positive integer id or null; anything else is an unexpected shape", () => {
    expect(toProfilePictureId({ fileId: 9001 })).toEqual({ fileId: 9001 })
    expect(toProfilePictureId({ fileId: null, extra: true })).toEqual({ fileId: null })
    for (const fileId of [0, -1, 1.5, "9001", Number.MAX_SAFE_INTEGER + 1, Number.NaN, undefined]) {
      expect(toProfilePictureId({ fileId })).toBeNull()
    }
    for (const raw of [{}, null, undefined, 9001, "9001", [9001], true]) expect(toProfilePictureId(raw)).toBeNull()
  })

  it("fetches through callApi and maps the body", async () => {
    server.use(http.get(ID_PATH, () => HttpResponse.json({ fileId: 9001 })))
    expect(await fetchProfilePictureId()).toEqual({ success: true, statusCode: 200, data: { fileId: 9001 } })
    server.use(http.get(ID_PATH, () => HttpResponse.json({ fileId: null })))
    expect(await loadProfilePictureId()).toEqual({ fileId: null })
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(ID_PATH, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchProfilePictureId()).toMatchObject({ success: false, statusCode: 502, data: undefined })
    server.use(http.get(ID_PATH, () => HttpResponse.json({ fileId: "9001" })))
    expect(await fetchProfilePictureId()).toEqual({
      success: false,
      statusCode: 200,
      error: "profile-picture/fetchProfilePictureId returned an unexpected shape",
    })
    await expect(loadProfilePictureId()).rejects.toBeInstanceOf(ApiResponseError)
  })

  it("is registered for keys.profilePictureId() on the root SWR fetcher", async () => {
    server.use(http.get(ID_PATH, () => HttpResponse.json({ fileId: 42 })))
    expect(await swrFetcher(keys.profilePictureId())).toEqual({ fileId: 42 })
    server.use(http.get(ID_PATH, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    await expect(swrFetcher(keys.profilePictureId())).rejects.toBeInstanceOf(ApiResponseError)
  })
})

describe("picture upload and delete (Story 1.10)", () => {
  const UPLOAD = "/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload"

  // A write goes out only for a loaded page user (D-A save safeguard, foundation PR #7): load
  // `myself` first, as the page does, and answer the safeguard's fresh `/myself` check.
  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it.each<[string, string]>([
    ["maria-2026.png", "maria-2026.jpg"],
    ["My Photo (1).JPEG", "My_Photo__1_.jpg"],
    ["C:\\fakepath\\pic.bmp", "pic.jpg"],
    ["/tmp/x/y.z.png", "y.z.jpg"],
    [".hidden.png", "hidden.jpg"],
    ["__..png", "picture.jpg"],
    ["", "picture.jpg"],
    ["ü.png", "picture.jpg"],
    ["noext", "noext.jpg"],
    [`${"a".repeat(150)}.png`, `${"a".repeat(96)}.jpg`],
  ])("profilePictureUploadName(%j) → %j", (name, expected) => {
    expect(profilePictureUploadName(name)).toBe(expected)
  })

  // MSW can't read a multipart body in this jsdom + undici setup (the stream closes early), so the
  // part is checked where it is built; the real body is asserted in e2e/profile-picture.spec.ts.
  it("posts one multipart `file` part, the JPEG named <base>.jpg, with no query and no JSON content type", async () => {
    const seen: { url: string; contentType: string | null }[] = []
    server.use(
      http.post(UPLOAD, ({ request }) => {
        seen.push({ url: request.url, contentType: request.headers.get("Content-Type") })
        return HttpResponse.json({ id: 9002 })
      }),
    )
    const append = vi.spyOn(FormData.prototype, "append")
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })
    expect(await uploadProfilePicture(blob, "maria portrait.png")).toEqual({ success: true, statusCode: 200, data: { id: 9002 } })
    expect(append.mock.calls).toEqual([["file", blob, "maria_portrait.jpg"]])
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0].url).search).toBe("")
    expect(seen[0].contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  it("counts a 2xx with an unreadable body as uploaded; returns failures as they are", async () => {
    const blob = new Blob([new Uint8Array([1])])
    server.use(http.post(UPLOAD, () => HttpResponse.text("OK", { status: 201 })))
    expect(await uploadProfilePicture(blob, "a.png")).toEqual({ success: true, statusCode: 201 })
    server.use(http.post(UPLOAD, () => HttpResponse.json({ errorCode: "TOO_LARGE", source: "proxy" }, { status: 413 })))
    expect(await uploadProfilePicture(blob, "a.png")).toMatchObject({ success: false, statusCode: 413, errorCode: "TOO_LARGE" })
    server.use(http.post(UPLOAD, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await uploadProfilePicture(blob, "a.png")).toMatchObject({ success: false, statusCode: 502 })
    server.use(http.post(UPLOAD, () => HttpResponse.error()))
    expect(await uploadProfilePicture(blob, "a.png")).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })

  it("deletes the old picture through the ownership-checked named op; sends nothing for a non-id", async () => {
    const deleted: string[] = []
    server.use(
      http.delete("/api/pp/file/:fileId", ({ request, params }) => {
        deleted.push(`${params.fileId}${new URL(request.url).search}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    expect(await deleteProfilePictureFile(9001)).toEqual({ success: true, statusCode: 204 })
    expect(deleted).toEqual(["9001"])
    expect(await deleteProfilePictureFile(0)).toEqual({ success: false, error: "profile-picture/deleteProfilePictureFile: not a file id" })
    expect(deleted).toEqual(["9001"])
    server.use(http.delete("/api/pp/file/:fileId", () => HttpResponse.json({ errorCode: "NO_FILE", source: "proxy" }, { status: 404 })))
    expect(await deleteProfilePictureFile(9001)).toMatchObject({ success: false, statusCode: 404 })
  })
})
