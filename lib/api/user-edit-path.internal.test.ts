import { describe, expect, it } from "vitest"
import { userEditPath } from "./user-edit-path.internal"

/** Shared by `personal.ts` (Team A) and `account.ts` (Team B); foundation-owned. */
describe("userEditPath", () => {
  it("is the proxy path of PUT v2/user/edit", () => {
    expect(userEditPath()).toBe("/api/1h/v2/user/edit")
  })
})
