import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import {
  ApiResponseError,
  fetchProfilePictureId,
  keys,
  loadProfilePictureId,
  profilePictureIdPath,
  profilePicturePreviewPath,
  profilePictureUploadPath,
  swrFetcher,
  toProfilePictureId,
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
