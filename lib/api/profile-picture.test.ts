import { describe, expect, it } from "vitest"
import { profilePictureIdPath, profilePicturePreviewPath, profilePictureUploadPath } from "."

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
