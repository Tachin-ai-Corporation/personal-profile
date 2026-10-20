import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ApiResponseError, ERROR_RULES, isTransientReadFailure, isUploadRejected, mapApiError, mapFetchError, mappedErrorCode, parseErrorBody, type ApiResponse, type ErrorScope, type MappedError, type MessageRule } from ".."

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
    ["413 TOO_LARGE (upload refused)", fail({ statusCode: 413, errorCode: "TOO_LARGE", source: "proxy" }), { kind: "coded", code: "UPLOAD_TOO_LARGE" }],
    ["415 UNSUPPORTED_MEDIA (upload refused)", fail({ statusCode: 415, errorCode: "UNSUPPORTED_MEDIA", source: "proxy" }), { kind: "coded", code: "UPLOAD_UNSUPPORTED_MEDIA" }],
    ["upstream 400 with a message", fail({ statusCode: 400, upstreamCode: 7, platformMessage: "X", error: "X" }), { kind: "generic", message: "X" }],
    ["upstream 499 with a message", fail({ statusCode: 499, platformMessage: "Edge", error: "Edge" }), { kind: "generic", message: "Edge" }],
    ["upstream 500 with a message (never shown)", fail({ statusCode: 500, platformMessage: "Boom", error: "Boom" }), { kind: "generic" }],
    ["upstream 503 with a message (never shown)", fail({ statusCode: 503, platformMessage: "Down", error: "Down" }), { kind: "generic" }],
    ["a non-error status with a message (never shown)", fail({ statusCode: 302, platformMessage: "Moved" }), { kind: "generic" }],
    ["upstream 400 without a message", fail({ statusCode: 400, upstreamCode: 7, error: "ctx failed (400)" }), { kind: "generic" }],
    ["unknown upstream 418", fail({ statusCode: 418 }), { kind: "generic" }],
  ])("maps %s", (_label, response, expected) => {
    expect(mapApiError("page", response)).toEqual(expected)
  })

  // Story 1.12 AC: a known backend code with no field mapping (INVALID_ENUM_VALUE) is a Section-level error.
  it("maps an upstream 400 INVALID_ENUM_VALUE to the generic Section-level error, never a field or a code", () => {
    const body = (extra: Record<string, unknown>) =>
      parseErrorBody(JSON.stringify({ errorCode: "INVALID_ENUM_VALUE", details: [{ field: "race", rejectedValue: "x" }], ...extra }), "personal/save failed (400)")
    const bare = body({})
    const response = fail({ statusCode: 400, ...bare })
    expect(response.errorCode).toBeUndefined()
    for (const scope of ["personal", "phone", "account"] as const) expect(mapApiError(scope, response)).toEqual({ kind: "generic" })
    const withMessage = fail({ statusCode: 400, ...body({ message: "Invalid value for race.", code: 400 }) })
    expect(mapApiError("personal", withMessage)).toEqual({ kind: "generic", message: "Invalid value for race." })
    expect(mappedErrorCode(mapApiError("personal", response))).toBe("GENERIC")
  })

  it("never shows a BFF user message or a fallback as the platform message", () => {
    expect(mapApiError("page", fail({ statusCode: 403, errorCode: "WRONG_TENANT", source: "proxy", userMessage: "copy" }))).toEqual({ kind: "generic" })
    expect(mapApiError("page", fail({ statusCode: 409, error: "ctx failed (409)" }))).toEqual({ kind: "generic" })
  })
})

const SSN_TAKEN = "The Social Security Number {123-45-6789} already belongs to another person."
const EMAIL_IN_USE = "User with email 'ann@example.com' already exists."
const PERSONAL_NPI = "Operation failed. The chosen Personal NPI Number: 1234567890 is already registered."
const PRACTICE_NPI = "Operation failed. The chosen Practice NPI Number: 1093817461 is already registered."
const CONTACT_TAKEN = "Operation failed. Person with id '42' already has contact point with value '+14155552125'."
const CONTACT_DUPLICATES = "Duplicate Contact Points specified."

/** An upstream error as `callApi` reports it (`{ message, code: <int> }`, `code` = HTTP status). */
const upstream = (statusCode: number, message: string): ApiResponse<unknown> =>
  fail({ statusCode, upstreamCode: statusCode, platformMessage: message, error: message })

describe("mapApiError: exact-message tables", () => {
  it.each<[string, ErrorScope, ApiResponse<unknown>, MappedError]>([
    ["SSN taken in personal", "personal", upstream(400, SSN_TAKEN), { kind: "field", field: "ssn", messageKey: "person.ssnTaken" }],
    ["email in use in account", "account", upstream(400, EMAIL_IN_USE), { kind: "field", field: "primaryEmail", messageKey: "account.primaryEmailInUse" }],
    ["MFA not enabled", "authenticator", upstream(409, "Mfa is not enabled for this user."), { kind: "coded", code: "MFA_NOT_ENABLED" }],
    ["MFA config missing", "authenticator", upstream(400, "Mfa config is missing."), { kind: "coded", code: "MFA_NOT_ENABLED" }],
    ["TOTP already enabled", "authenticator", upstream(409, "Totp is already enabled."), { kind: "coded", code: "TOTP_ALREADY_ENABLED" }],
    ["personal NPI taken", "provider", upstream(400, PERSONAL_NPI), { kind: "field", field: "personalNpi", messageKey: "npi.personalNpiTaken" }],
    ["practice NPI taken", "provider", upstream(400, PRACTICE_NPI), { kind: "field", field: "practiceNpi", messageKey: "npi.practiceNpiTaken" }],
    ["phone taken", "phone", upstream(400, CONTACT_TAKEN), { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" }],
    ["phone duplicates", "phone", upstream(400, CONTACT_DUPLICATES), { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" }],
    ["email taken", "email", upstream(400, CONTACT_TAKEN), { kind: "field", field: "value", messageKey: "contacts.duplicateEmail" }],
    ["social duplicates", "social", upstream(400, CONTACT_DUPLICATES), { kind: "field", field: "value", messageKey: "contacts.duplicateSocial" }],
  ])("maps %s", (_label, scope, response, expected) => {
    expect(mapApiError(scope, response)).toEqual(expected)
  })

  it.each<[string, ErrorScope, ApiResponse<unknown>]>([
    ["SSN taken outside personal", "account", upstream(400, SSN_TAKEN)],
    ["email in use outside account and email", "phone", upstream(400, EMAIL_IN_USE)],
    ["an MFA text outside authenticator", "personal", upstream(409, "Totp is already enabled.")],
    ["an NPI text outside provider", "organizations", upstream(400, PERSONAL_NPI)],
    ["a contact duplicate outside contacts", "addresses", upstream(400, CONTACT_DUPLICATES)],
    ["a near-miss MFA text", "authenticator", upstream(409, "Mfa is not enabled for this user")],
    ["a near-miss SSN text", "personal", upstream(400, "The Social Security Number {123-45-6789} already belongs to another person")],
    ["an SSN text with a prefix", "personal", upstream(400, `Error: ${SSN_TAKEN}`)],
    ["a near-miss email text", "account", upstream(400, "User with username 'ann' already exists.")],
    ["an email text with a suffix", "account", upstream(400, `${EMAIL_IN_USE} Try again.`)],
    ["a near-miss NPI text", "provider", upstream(400, "Operation failed. The chosen Personal NPI Number: abc is already registered.")],
    ["an NPI text with a suffix", "provider", upstream(400, `${PERSONAL_NPI} Call support.`)],
    ["an NPI text without its prefix", "provider", upstream(400, "The chosen Practice NPI Number: 1 is already registered.")],
    ["an NPI text with a lower-case subject", "provider", upstream(400, "Operation failed. The chosen practice NPI Number: 1 is already registered.")],
    ["a near-miss contact text", "phone", upstream(400, "Duplicate Contact Points specified")],
    ["a contact text with another subject", "email", upstream(400, "Operation failed. Organization with id '4' already has contact point with value 'x'.")],
    ["an unknown message", "personal", upstream(400, "Something else.")],
  ])("leaves %s as generic with the platform message", (_label, scope, response) => {
    expect(mapApiError(scope, response)).toEqual({ kind: "generic", message: response.platformMessage })
  })

  it("never matches a 5xx, a proxy body or a 403", () => {
    expect(mapApiError("personal", upstream(500, SSN_TAKEN))).toEqual({ kind: "generic" })
    expect(mapApiError("authenticator", fail({ statusCode: 400, errorCode: "BAD_BODY", source: "proxy", platformMessage: "Totp is already enabled." }))).toEqual({ kind: "generic" })
    expect(mapApiError("authenticator", upstream(403, "Mfa config is missing."))).toEqual({ kind: "forbidden" })
  })
})

describe("area tables", () => {
  const root = process.cwd()
  const AREA_FILES = readdirSync(join(root, "lib/api/errors")).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !["index.ts", "core.ts", "forbidden-scope.ts"].includes(name),
  )

  it("aggregates every area file's rules exactly once", async () => {
    const areas = await Promise.all(AREA_FILES.map((name) => import(`./${name.replace(/\.ts$/, "")}`) as Promise<{ rules: readonly MessageRule[] }>))
    const all = areas.flatMap((area) => area.rules)
    expect(ERROR_RULES).toHaveLength(all.length)
    for (const rule of all) expect(ERROR_RULES).toContain(rule)
  })

  it("anchors every pattern to the whole message", () => {
    for (const rule of ERROR_RULES) {
      expect(rule.pattern.source.startsWith("^")).toBe(true)
      expect(rule.pattern.source.endsWith("$")).toBe(true)
    }
  })
})

describe("mappedErrorCode", () => {
  it.each<[MappedError, string]>([
    [{ kind: "forbidden" }, "FORBIDDEN"],
    [{ kind: "network" }, "NETWORK_ERROR"],
    [{ kind: "session" }, "SESSION_EXPIRED"],
    [{ kind: "generic", message: "x" }, "GENERIC"],
    [{ kind: "field", field: "ssn", messageKey: "person.ssnTaken" }, "FIELD"],
    [{ kind: "coded", code: "NPI_ALREADY_REGISTERED" }, "NPI_ALREADY_REGISTERED"],
    [{ kind: "coded", code: "UPLOAD_TOO_LARGE" }, "UPLOAD_TOO_LARGE"],
    [{ kind: "coded", code: "UPLOAD_UNSUPPORTED_MEDIA" }, "UPLOAD_UNSUPPORTED_MEDIA"],
  ])("%j → %s", (error, code) => {
    expect(mappedErrorCode(error)).toBe(code)
  })
})

describe("isUploadRejected (spec F7-2)", () => {
  it.each<[MappedError, boolean]>([
    [{ kind: "coded", code: "UPLOAD_TOO_LARGE" }, true],
    [{ kind: "coded", code: "UPLOAD_UNSUPPORTED_MEDIA" }, true],
    [{ kind: "coded", code: "MFA_NOT_ENABLED" }, false],
    [{ kind: "generic" }, false],
    [{ kind: "network" }, false],
  ])("%j → %s", (error, expected) => {
    expect(isUploadRejected(error)).toBe(expected)
  })
})

describe("isTransientReadFailure (myself auto-retry, human decision 2026-10-14)", () => {
  const failure = (response: Partial<ApiResponse<unknown>>) => new ApiResponseError({ success: false, ...response })

  it.each<[string, unknown, boolean]>([
    ["502 UPSTREAM_ERROR", failure({ statusCode: 502, errorCode: "UPSTREAM_ERROR" }), true],
    ["503 REFRESH_UNAVAILABLE", failure({ statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }), true],
    ["504 UPSTREAM_TIMEOUT", failure({ statusCode: 504, errorCode: "UPSTREAM_TIMEOUT" }), true],
    ["a network error", failure({ errorCode: "NETWORK_ERROR" }), true],
    ["401 SESSION_EXPIRED", failure({ statusCode: 401, errorCode: "SESSION_EXPIRED" }), false],
    ["403", failure({ statusCode: 403 }), false],
    ["404", failure({ statusCode: 404 }), false],
    ["429", failure({ statusCode: 429 }), false],
    ["an unreadable 200 body", failure({ statusCode: 200 }), false],
    ["BAD_PATH", failure({ errorCode: "BAD_PATH" }), false],
    ["an unknown SWR key (no code, no status)", failure({}), false],
    ["a plain Error", new Error("x"), false],
  ])("%s → %s", (_name, error, expected) => {
    expect(isTransientReadFailure(error)).toBe(expected)
  })
})

describe("mapFetchError", () => {
  it("maps an ApiResponseError by its response and anything else as generic", () => {
    expect(mapFetchError("page", new ApiResponseError(fail({ statusCode: 403 })))).toEqual({ kind: "forbidden" })
    expect(mapFetchError("personal", new ApiResponseError(upstream(400, SSN_TAKEN)))).toEqual({ kind: "field", field: "ssn", messageKey: "person.ssnTaken" })
    expect(mapFetchError("page", new Error("boom"))).toEqual({ kind: "generic" })
    expect(mapFetchError("page", undefined)).toEqual({ kind: "generic" })
  })
})

describe("error-code ownership", () => {
  // Vitest runs from the repository root.
  const root = process.cwd()
  /** Modules allowed to read the error fields (the transport, the parser, the mapping, the type, the wire contract). */
  const ALLOWED = new Set([
    "lib/api/client.ts",
    "lib/api/errors-codes.ts",
    ...readdirSync(join(root, "lib/api/errors"))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => `lib/api/errors/${name}`),
    "lib/api/types.ts",
    "lib/shared/bff-contract.ts",
  ])
  /** Client code only: lib/server and the app/api route handlers are the BFF that writes these fields. */
  const CLIENT_DIRS = ["lib", "features", "components", "hooks", "contexts", "app"]
  const SERVER_PATHS = new Set(["lib/server", "app/api"])
  const ERROR_FIELD_READ = /\b(errorCode|upstreamCode|platformMessage)\b|\.source\s*===|\bsource\s*:\s*["'`]proxy["'`]/
  const UPSTREAM_TEXT = /Mfa is not enabled|Mfa config is missing|Totp is already enabled|NPI Number|already belongs to another person|already has contact point|Duplicate Contact Points|User with email/
  const NPI_SEARCH_LABEL = "Search for your practice's (hospital, clinic, lab, etc.) NPI Number"
  const hasUpstreamText = (code: string): boolean => UPSTREAM_TEXT.test(code.replaceAll(NPI_SEARCH_LABEL, ""))

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
    expect(ALLOWED).toContain("lib/api/errors/index.ts")
    expect(ALLOWED).toContain("lib/api/errors/mfa.ts")
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

  it("no module outside lib/api/errors matches upstream message text", () => {
    const offenders = CLIENT_DIRS.flatMap(sources)
      .filter((path) => !path.startsWith("lib/api/errors/"))
      .filter((path) => hasUpstreamText(readFileSync(join(root, path), "utf8")))
    expect(offenders).toEqual([])
  })

  it.each(["Personal", "Practice"])("the upstream-text guard detects the actual %s NPI rejection", (kind) => {
    expect(hasUpstreamText(`Operation failed. The chosen ${kind} NPI Number: 1234567890 is already registered.`)).toBe(true)
    expect(hasUpstreamText(`/^Operation failed\\. The chosen ${kind} NPI Number: \\d+ is already registered\\.$/`)).toBe(true)
  })

  it("the required practice-search label is UI copy, not an upstream matcher", () => {
    expect(hasUpstreamText(NPI_SEARCH_LABEL)).toBe(false)
  })

  it.each(['message.includes("NPI Number")', '/NPI Number/.test(response.error)'])("the upstream guard still catches generic matching: %s", (code) => {
    expect(hasUpstreamText(code)).toBe(true)
    expect(hasUpstreamText(`${NPI_SEARCH_LABEL}\n${code}`)).toBe(true)
  })
})
