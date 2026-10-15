import { describe, expect, it } from "vitest"
import { normalizeProxyPath } from "./normalize"

describe("normalizeProxyPath", () => {
  it("decodes clean paths into segments", () => {
    expect(normalizeProxyPath("v2/user/myself")).toEqual(["v2", "user", "myself"])
    expect(normalizeProxyPath("v2/user/%41bc")).toEqual(["v2", "user", "Abc"])
  })

  it.each([
    ["..%2F", "v2/..%2Fx"],
    ["%2e%2e", "v2/%2e%2e/x"],
    ["%2e", "v2/%2E/x"],
    ["%252F", "v2/%252Fx"],
    ["//host", "//host/v2"],
    ["double slash", "v2//user"],
    [";x", "v2/user;x/myself"],
    ["trailing /", "v2/user/myself/"],
    ["leading /", "/v2/user"],
    ["..", "v2/../x"],
    [".", "v2/./x"],
    ["%5C", "v2/%5Cx"],
    ["backslash", "v2\\x"],
    ["@", "v2/a@b"],
    [":", "v2/a:b"],
    ["encoded space", "v2/a%20b"],
    ["raw space", "v2/a b"],
    ["control char", "v2/a%0Ab"],
    ["lone %", "v2/a%zz"],
    ["invalid UTF-8", "v2/%C3"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(normalizeProxyPath(raw)).toBeNull()
  })
})
