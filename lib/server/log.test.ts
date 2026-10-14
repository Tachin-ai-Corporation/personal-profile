// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `log.ts` reads `APP_ENV` from `env.ts` at load, so the dev vs non-dev body
 * logger is exercised by importing under each `APP_ENV`.
 */

const BASE_ENV = {
  APP_ORIGIN: "https://personal-profile-demo.vercel.app",
  APP_ID: "app-id-123",
  ONEHEALTH_SECRET_KEY: "onehealth-secret",
  SESSION_SECRET: "log-session-secret-0123456789abcdef",
}

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.resetModules()
  vi.restoreAllMocks()
})

async function load(appEnv: string) {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...BASE_ENV, APP_ENV: appEnv }
  return import("./log")
}

describe("logProxy — PHI-free line", () => {
  it("logs only template/method/status/duration/request-id, never the substituted id or path", async () => {
    const { logProxy } = await load("demo")
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    logProxy({ requestId: "req-1", method: "GET", template: "/v2/person/{personId}/ssn/expose", status: 200, durationMs: 12 })

    expect(spy).toHaveBeenCalledOnce()
    const logged = JSON.parse(spy.mock.calls[0][0] as string)
    expect(logged).toEqual({
      requestId: "req-1",
      method: "GET",
      template: "/v2/person/{personId}/ssn/expose",
      status: 200,
      durationMs: 12,
    })
    // The template placeholder is present; a concrete id must never appear.
    const line = spy.mock.calls[0][0] as string
    expect(line).toContain("{personId}")
    expect(line).not.toMatch(/\/v2\/person\/\d+\//)
  })
})

describe("logError", () => {
  it("logs only request-id/route/status/error-name", async () => {
    const { logError } = await load("demo")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logError({ requestId: "req-2", routeTemplate: "/v2/user/myself", status: 500, errorName: "TypeError" })
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      requestId: "req-2",
      routeTemplate: "/v2/user/myself",
      status: 500,
      errorName: "TypeError",
    })
  })
})

describe("logBody — dev only", () => {
  it("is a no-op outside dev (no token or body reaches logs)", async () => {
    const { logBody } = await load("prod")
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    logBody("request", JSON.stringify({ access_token: "secret-token-value" }))
    expect(spy).not.toHaveBeenCalled()
  })

  it("logs a redacted body in dev", async () => {
    const { logBody } = await load("dev")
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    logBody("request", JSON.stringify({ accessToken: "abc.def.ghi", ssn: "123-45-6789" }))
    expect(spy).toHaveBeenCalledOnce()
    const line = spy.mock.calls[0][0] as string
    expect(line).not.toContain("123-45-6789")
    expect(line).toContain("[REDACTED")
  })
})

describe("redactBody", () => {
  it("redacts bearer tokens, JWTs, SSNs, and secret fields", async () => {
    const { redactBody } = await load("dev")
    const input = [
      "Authorization: Bearer abcDEF123._-token",
      "jwt eyJhbGciOi.someMiddlePart123.signatureSegment99",
      "ssn 123-45-6789 and 987654321",
      '{"refreshToken":"keepme","password":"hunter2"}',
    ].join("\n")
    const out = redactBody(input)
    expect(out).not.toContain("abcDEF123._-token")
    expect(out).not.toContain("123-45-6789")
    expect(out).not.toContain("987654321")
    expect(out).not.toContain("hunter2")
    expect(out).not.toContain("keepme")
  })
})
