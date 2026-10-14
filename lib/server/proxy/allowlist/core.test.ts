import { describe, expect, it } from "vitest"
import { entries } from "./core"

describe("core entries", () => {
  it("ships GET v2/user/myself, not a Profile-module entry", () => {
    expect(entries).toEqual([{ method: "GET", template: "v2/user/myself" }])
  })
})
