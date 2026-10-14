// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TEST_SERVER_ENV } from "../../test/env-fixture"

/** `proxy-allowlist.ts` imports `server-only` only; env is still validated via the stub chain. */

const BASE_ENV = { ...TEST_SERVER_ENV, SESSION_SECRET: "allowlist-session-secret-0123456789abcdef" }

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

async function load() {
  return import("./proxy-allowlist")
}

describe("shipped ALLOWLIST", () => {
  it("holds exactly one entry: GET /v2/user/myself, no query, no body", async () => {
    const { ALLOWLIST } = await load()
    expect(ALLOWLIST).toHaveLength(1)
    expect(ALLOWLIST[0]).toMatchObject({ method: "GET", template: "/v2/user/myself", body: "none" })
    expect(ALLOWLIST[0].query).toEqual({})
    expect(ALLOWLIST[0].asImage).toBeUndefined()
  })
})

describe("parseTemplate", () => {
  it("splits literals, owner placeholders, and id placeholders", async () => {
    const { parseTemplate } = await load()
    expect(parseTemplate("/v2/person/{personId}/ssn/expose")).toEqual([
      { type: "literal", value: "v2" },
      { type: "literal", value: "person" },
      { type: "owner", key: "personId" },
      { type: "literal", value: "ssn" },
      { type: "literal", value: "expose" },
    ])
    expect(parseTemplate("/v2/person/location/{id}")).toEqual([
      { type: "literal", value: "v2" },
      { type: "literal", value: "person" },
      { type: "literal", value: "location" },
      { type: "id", name: "id" },
    ])
    expect(parseTemplate("/v2/user/{userId}")).toEqual([
      { type: "literal", value: "v2" },
      { type: "literal", value: "user" },
      { type: "owner", key: "userId" },
    ])
  })
})

describe("findMatch", () => {
  const allowlist = [
    { method: "GET" as const, template: "/v2/user/myself", query: {}, body: "none" as const },
    { method: "PUT" as const, template: "/v2/person/location/{id}", query: {}, body: "json" as const },
  ]

  it("matches METHOD + exact template", async () => {
    const { findMatch } = await load()
    const r = findMatch(allowlist, "GET", ["v2", "user", "myself"])
    expect(r.kind).toBe("match")
  })

  it("returns wrong-method when the shape matches another method", async () => {
    const { findMatch } = await load()
    const r = findMatch(allowlist, "POST", ["v2", "user", "myself"])
    expect(r.kind).toBe("wrong-method")
  })

  it("matches a placeholder shape regardless of the concrete value", async () => {
    const { findMatch } = await load()
    const r = findMatch(allowlist, "PUT", ["v2", "person", "location", "anything"])
    expect(r.kind).toBe("match")
  })

  it("returns none when no template shape matches", async () => {
    const { findMatch } = await load()
    expect(findMatch(allowlist, "GET", ["v2", "admin", "thing"]).kind).toBe("none")
    expect(findMatch(allowlist, "GET", ["v2", "user"]).kind).toBe("none")
  })
})

describe("isDeniedPath", () => {
  it("denies auth, admin, graphql, and public external-application prefixes", async () => {
    const { isDeniedPath } = await load()
    expect(isDeniedPath(["auth", "x"])).toBe(true)
    expect(isDeniedPath(["v2", "admin", "thing"])).toBe(true)
    expect(isDeniedPath(["graphql"])).toBe(true)
    expect(isDeniedPath(["v2", "graphql"])).toBe(true)
    expect(isDeniedPath(["v2", "public", "external-application", "auth"])).toBe(true)
    expect(isDeniedPath([])).toBe(true)
  })

  it("allows an ordinary path", async () => {
    const { isDeniedPath } = await load()
    expect(isDeniedPath(["v2", "user", "myself"])).toBe(false)
  })
})

describe("ID_SEGMENT", () => {
  it("matches 1–19 digits only", async () => {
    const { ID_SEGMENT } = await load()
    expect(ID_SEGMENT.test("1")).toBe(true)
    expect(ID_SEGMENT.test("1234567890123456789")).toBe(true)
    expect(ID_SEGMENT.test("12345678901234567890")).toBe(false) // 20 digits
    expect(ID_SEGMENT.test("")).toBe(false)
    expect(ID_SEGMENT.test("1a")).toBe(false)
    expect(ID_SEGMENT.test("-1")).toBe(false)
  })
})
