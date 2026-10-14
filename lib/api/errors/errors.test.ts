import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ApiResponseError, mapApiError, mapFetchError, type ApiResponse, type MappedError } from "."

const fail = (fields: Omit<ApiResponse<unknown>, "success">): ApiResponse<unknown> => ({ success: false, ...fields })

describe("mapApiError", () => {
  it.each<[string, ApiResponse<unknown>, MappedError]>([
    ["upstream 403", fail({ statusCode: 403, upstreamCode: 1403, platformMessage: "Denied" }), { kind: "forbidden" }],
    ["upstream 403 without a body", fail({ statusCode: 403 }), { kind: "forbidden" }],
    ["proxy NOT_ALLOWED 403", fail({ statusCode: 403, errorCode: "NOT_ALLOWED", source: "proxy" }), { kind: "generic" }],
    ["proxy 403 with an unknown code", fail({ statusCode: 403, source: "proxy" }), { kind: "generic" }],
    ["proxy BAD_BODY", fail({ statusCode: 400, errorCode: "BAD_BODY", source: "proxy" }), { kind: "generic" }],
    ["proxy INTERNAL_ERROR", fail({ statusCode: 500, errorCode: "INTERNAL_ERROR", source: "proxy" }), { kind: "generic" }],
    ["client BAD_PATH (no status)", fail({ errorCode: "BAD_PATH" }), { kind: "generic" }],
    ["network failure (no status)", fail({ errorCode: "NETWORK_ERROR" }), { kind: "network" }],
    ["no status at all", fail({}), { kind: "network" }],
    ["502 UPSTREAM_ERROR", fail({ statusCode: 502, errorCode: "UPSTREAM_ERROR", source: "proxy" }), { kind: "network" }],
    ["502 UPSTREAM_REDIRECT", fail({ statusCode: 502, errorCode: "UPSTREAM_REDIRECT", source: "proxy" }), { kind: "network" }],
    ["503 REFRESH_UNAVAILABLE", fail({ statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }), { kind: "network" }],
    ["503 SERVICE_DISABLED", fail({ statusCode: 503, errorCode: "SERVICE_DISABLED", source: "proxy" }), { kind: "network" }],
    ["504 UPSTREAM_TIMEOUT", fail({ statusCode: 504, errorCode: "UPSTREAM_TIMEOUT", source: "proxy" }), { kind: "network" }],
    ["SESSION_EXPIRED", fail({ statusCode: 401, errorCode: "SESSION_EXPIRED" }), { kind: "session" }],
    ["upstream 400 with a message", fail({ statusCode: 400, upstreamCode: 7, platformMessage: "X", error: "X" }), { kind: "generic", message: "X" }],
    ["upstream 499 with a message", fail({ statusCode: 499, platformMessage: "Edge", error: "Edge" }), { kind: "generic", message: "Edge" }],
    ["upstream 500 with a message (never shown)", fail({ statusCode: 500, platformMessage: "Boom", error: "Boom" }), { kind: "generic" }],
    ["upstream 503 with a message (never shown)", fail({ statusCode: 503, platformMessage: "Down", error: "Down" }), { kind: "generic" }],
    ["a non-error status with a message (never shown)", fail({ statusCode: 302, platformMessage: "Moved" }), { kind: "generic" }],
    ["upstream 400 without a message", fail({ statusCode: 400, upstreamCode: 7, error: "ctx failed (400)" }), { kind: "generic" }],
    ["unknown upstream 418", fail({ statusCode: 418 }), { kind: "generic" }],
  ])("maps %s", (_label, response, expected) => {
    expect(mapApiError(response)).toEqual(expected)
  })

  it("never shows a BFF user message or a fallback as the platform message", () => {
    expect(mapApiError(fail({ statusCode: 403, errorCode: "WRONG_TENANT", source: "proxy", userMessage: "copy" }))).toEqual({ kind: "generic" })
    expect(mapApiError(fail({ statusCode: 409, error: "ctx failed (409)" }))).toEqual({ kind: "generic" })
  })
})

describe("mapFetchError", () => {
  it("maps an ApiResponseError by its response and anything else as generic", () => {
    expect(mapFetchError(new ApiResponseError(fail({ statusCode: 403 })))).toEqual({ kind: "forbidden" })
    expect(mapFetchError(new Error("boom"))).toEqual({ kind: "generic" })
    expect(mapFetchError(undefined)).toEqual({ kind: "generic" })
  })
})

describe("error-code ownership", () => {
  // Vitest runs from the repository root.
  const root = process.cwd()
  /** Modules allowed to read the error fields (the transport, the parser, the mapping, the type, the wire contract). */
  const ALLOWED = new Set([
    "lib/api/client.ts",
    "lib/api/errors-codes.ts",
    "lib/api/errors.ts",
    "lib/api/types.ts",
    "lib/shared/bff-contract.ts",
  ])
  /** Client code only: lib/server and the app/api route handlers are the BFF that writes these fields. */
  const CLIENT_DIRS = ["lib", "features", "components", "hooks", "contexts", "app"]
  const SERVER_PATHS = new Set(["lib/server", "app/api"])
  const ERROR_FIELD_READ = /\b(errorCode|upstreamCode|platformMessage)\b|\.source\s*===|\bsource\s*:\s*["'`]proxy["'`]/

  function sources(dir: string): string[] {
    let entries: string[]
    try {
      entries = readdirSync(join(root, dir))
    } catch {
      return []
    }
    return entries.flatMap((name) => {
      const path = `${dir}/${name}`
      if (statSync(join(root, path)).isDirectory()) return SERVER_PATHS.has(path) ? [] : sources(path)
      return /\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [path] : []
    })
  }

  const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

  it("scans top-level lib files and skips the server", () => {
    const scanned = CLIENT_DIRS.flatMap(sources)
    expect(scanned).toContain("lib/utils.ts")
    expect(scanned.some((path) => path.startsWith("lib/server/") || path.startsWith("app/api/"))).toBe(false)
  })

  it.each([
    ["errorCode", "r.errorCode"],
    ["upstreamCode", "const { upstreamCode } = r"],
    ["platformMessage", "r.platformMessage"],
    ["a source comparison", 'r.source === "proxy"'],
    ["a proxy source literal", '{ source: "proxy" }'],
  ])("the guard pattern catches %s", (_label, code) => {
    expect(ERROR_FIELD_READ.test(stripComments(code))).toBe(true)
  })

  it("no other client module reads errorCode, upstreamCode, platformMessage or the proxy source", () => {
    const offenders = CLIENT_DIRS.flatMap(sources)
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => ERROR_FIELD_READ.test(stripComments(readFileSync(join(root, path), "utf8"))))
    expect(offenders).toEqual([])
  })
})
