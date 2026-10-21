import { afterEach, describe, expect, it, vi } from "vitest"
import { SENSITIVE_SAMPLE } from "@/test/redaction-fixture"
import { bodyForLog, logApiCall, redact } from "./log-api-call"

afterEach(() => vi.unstubAllEnvs())

describe("logApiCall (D6)", () => {
  it("is silent outside development (tests and builds)", () => {
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    logApiCall({ method: "GET", path: "/api/x", status: 200, durationMs: 1 })
    expect(group).not.toHaveBeenCalled()
  })

  it("writes one collapsed group per call in development, redacted", () => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    logApiCall({ method: "POST", path: "/api/token", status: 200, durationMs: 12, requestBody: { lpl: "secret-payload" }, responseBody: { ok: true } })
    logApiCall({ method: "GET", path: "/api/x", durationMs: 3 })
    expect(group).toHaveBeenNthCalledWith(1, "[api] POST /api/token → 200 (12 ms)")
    expect(group).toHaveBeenNthCalledWith(2, "[api] GET /api/x → network error (3 ms)")
    expect(log).toHaveBeenCalledWith("request", { lpl: "[redacted]" })
    expect(log).toHaveBeenCalledWith("response", { ok: true })
    expect(end).toHaveBeenCalledTimes(2)
  })

  it("redacts SSN-shaped values, MFA code, qrCode, lpl, token-like keys and authorization", () => {
    const out = JSON.stringify(redact(SENSITIVE_SAMPLE))
    for (const leaked of ["123-45-6789", "654321", "data:image", "lpl-value", "tok-a", "tok-r", "tok-i", "Bearer x", "eyJhbGciOi"]) {
      expect(out).not.toContain(leaked)
    }
    expect(out).toContain('"firstName":"Ann"')
    expect(out).toContain('"count":3')
    let deep: unknown = "leaf"
    for (let i = 0; i < 12; i++) deep = { child: deep }
    expect(JSON.stringify(redact(deep))).toContain("[redacted]")
  })

  it.each([
    ["/api/1h/v2/user/npi", "/api/1h/v2/user/npi"],
    ["/api/places/autocomplete", "/api/places/autocomplete"],
    ["/api/places/details?unexpected=private", "/api/places/details"],
    ["/api/places/%64etails", "/api/places/details"],
    ["/api/places/auto\tcomplete", "/api/places/autocomplete"],
    ["/api/1h/v2/user/npi?unexpected=private#private", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/public/npi/list?searchText=private&entityTypeCode=1", "/api/1h/v2/public/npi/list"],
    ["/api/1h/v2/%75ser/npi?private", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/public/%6Epi/list/?private", "/api/1h/v2/public/npi/list"],
    ["/api//1h/v2/public/npi/list?private", "/api/1h/v2/public/npi/list"],
    ["/api/1h/v2/u\tser/npi?private", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/public/np\ni/list?private", "/api/1h/v2/public/npi/list"],
    ["/api/1h/v2/user/npi\r?private", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/user/npi \t\r\n", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/public/npi/list\u0000\u001f ", "/api/1h/v2/public/npi/list"],
    ["/api/1h/v2/user/.\t/npi?private", "/api/1h/v2/user/npi"],
    ["/api/1h/v2/public/old/..\n/npi/list?private", "/api/1h/v2/public/npi/list"],
    ["/api/1h/v2/user/%2e\r/npi?private", "/api/1h/v2/user/npi"],
  ])("logs only metadata for %s, even with sensitive errors or request bodies", (path, route) => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    for (const status of [200, 403, 500, undefined]) {
      logApiCall({ method: "GET", path, status, durationMs: 7, requestBody: { searchText: "private" }, responseBody: { npi: 1234567890, name: "Private Person", message: "private error" } })
      expect(group).toHaveBeenLastCalledWith(`[api] GET ${route} → ${status ?? "network error"} (7 ms)`)
    }
    expect(log).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(group.mock.calls)).not.toMatch(/private|1234567890|Private Person/)
  })

  it("preserves ordinary route logging, including URL whitespace", () => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    const path = "/api/1h/v2/u\tser/myself?field=name "
    logApiCall({ method: "GET", path, status: 200, durationMs: 2, responseBody: { firstName: "Ann" } })
    expect(group).toHaveBeenCalledWith(`[api] GET ${path} → 200 (2 ms)`)
    expect(log).toHaveBeenCalledWith("response", { firstName: "Ann" })
  })

  it.each(["http://[", "http://invalid:port/api/x"])("preserves malformed-path logging for %s", (path) => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    expect(() => logApiCall({ method: "GET", path, status: 400, durationMs: 2, responseBody: { name: "Ann" } })).not.toThrow()
    expect(group).toHaveBeenCalledWith(`[api] GET ${path} → 400 (2 ms)`)
    expect(log).toHaveBeenCalledWith("response", { name: "Ann" })
  })

  it("parses bodies for display", () => {
    expect(bodyForLog(undefined)).toBeUndefined()
    expect(bodyForLog("")).toBeUndefined()
    expect(bodyForLog('{"a":1}')).toEqual({ a: 1 })
    expect(bodyForLog("plain")).toBe("plain")
  })
})
