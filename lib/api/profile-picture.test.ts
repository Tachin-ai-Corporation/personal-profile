import { describe, expect, it } from "vitest"
import { profilePictureIdPath, profilePictureUploadPath } from "."

/** Profile picture (Team A, Stories 1.9–1.10). Team A adds its own cases here. */
describe("profile-picture", () => {
  it("paths", () => {
    expect(profilePictureIdPath()).toBe("/api/pp/profile-picture-id")
    expect(profilePictureUploadPath()).toBe("/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
  })
})
