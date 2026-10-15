import { describe, expect, it } from "vitest"
import { isDenied } from "./deny-list"
import type { ProxyMethod } from "./types"

const seg = (path: string) => path.split("/")

describe("deny list", () => {
  it.each<[ProxyMethod, string, boolean]>([
    ["POST", "v2/mfa/enable/totp", false],
    ["POST", "v2/mfa/disable/totp", false],
    ["POST", "v2/mfa/enable", true],
    ["GET", "v2/mfa/enable", false],
    ["POST", "v2/mfa/disable", true],
    ["POST", "v2/mfa/enable/123", true],
    ["DELETE", "v2/mfa/disable/9", true],
    ["GET", "v2/mfa/validate/123", true],
    ["GET", "v2/mfa/validate/abc", false],
    ["POST", "v2/user/switch-tenant/5", true],
    ["POST", "v2/user/switch-tenant", true],
    ["PUT", "v2/user/update-password", true],
    ["GET", "v2/tenant/sys-config", true],
    ["GET", "auth/oauth2/token", true],
    ["POST", "v2/public/external-application/auth/oauth2/user/token", true],
    ["GET", "v2/admin/users", true],
    ["POST", "graphql", true],
    ["GET", "v2/user/myself", false],
    ["DELETE", "v2/file/42", true],
    ["DELETE", "v2/file/1,2", true],
    ["GET", "v2/file/42/download", false],
  ])("%s %s → denied: %s", (method, path, expected) => {
    expect(isDenied(method, seg(path))).toBe(expected)
  })
})
