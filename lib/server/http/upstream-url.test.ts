import { describe, expect, it } from "vitest"
import { buildUpstreamUrl } from "./upstream-url"

const ROOT = "https://1health.demo.1health.io"

describe("buildUpstreamUrl", () => {
  it("encodes each segment and the query with encodeURIComponent", () => {
    expect(buildUpstreamUrl(ROOT, ["v2", "user", "myself"], new URLSearchParams())).toBe(`${ROOT}/api/v2/user/myself`)
    expect(buildUpstreamUrl(ROOT, ["v2", "a b"], new URLSearchParams("q=a b&x=é"))).toBe(`${ROOT}/api/v2/a%20b?q=a%20b&x=%C3%A9`)
  })

  it("defaults to no query and encodes a name with a space as %20 (sys-config's `Tenant IDs`)", () => {
    expect(buildUpstreamUrl(ROOT, ["graphql"])).toBe(`${ROOT}/api/graphql`)
    expect(buildUpstreamUrl(ROOT, ["v2", "tenant", "sys-config"], new URLSearchParams([["Tenant IDs", "7"]]))).toBe(
      `${ROOT}/api/v2/tenant/sys-config?Tenant%20IDs=7`,
    )
  })

  it("refuses anything that does not rebuild to the same origin and path", () => {
    expect(buildUpstreamUrl(ROOT, ["v2", ".."], new URLSearchParams())).toBeNull()
  })

  it("uses only the root's origin: a trailing slash or path never breaks the URL", () => {
    expect(buildUpstreamUrl(`${ROOT}/`, ["v2", "user", "myself"])).toBe(`${ROOT}/api/v2/user/myself`)
    expect(buildUpstreamUrl(`${ROOT}/some/path`, ["graphql"])).toBe(`${ROOT}/api/graphql`)
  })

  it("answers null for an unparsable root instead of throwing", () => {
    expect(buildUpstreamUrl("not a url", ["v2"])).toBeNull()
  })
})
