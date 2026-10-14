// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `log.ts` is env-free: server logs never carry bodies, in any environment and
 * also under local `next dev` (D6).
 */

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.resetModules()
  vi.restoreAllMocks()
})

async function load(nodeEnv: "development" | "production" | "test" = "test") {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, NODE_ENV: nodeEnv }
  return import("./log")
}

describe("logProxy — PHI-free line", () => {
  it("logs only template/method/status/duration/request-id, never the substituted id or path", async () => {
    const { logProxy } = await load()
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
    const { logError } = await load()
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

describe("no body logger (D6)", () => {
  it("exports no body logger or redactor, also under next dev", async () => {
    const mod = (await load("development")) as Record<string, unknown>
    expect(Object.keys(mod).sort()).toEqual(["logError", "logLaunch", "logProxy", "logRoute"])
  })
})

describe("logLaunch", () => {
  it("logs only request-id/route/outcome/environment/duration", async () => {
    const { logLaunch } = await load()
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    logLaunch({ requestId: "req-3", outcome: "OK", environment: "demo", durationMs: 40 })
    logLaunch({ requestId: "req-4", outcome: "LAUNCH_INVALID", durationMs: 2 })
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      requestId: "req-3",
      routeTemplate: "/api/token",
      outcome: "OK",
      environment: "demo",
      durationMs: 40,
    })
    expect(JSON.parse(spy.mock.calls[1][0] as string)).toEqual({
      requestId: "req-4",
      routeTemplate: "/api/token",
      outcome: "LAUNCH_INVALID",
      durationMs: 2,
    })
  })
})
