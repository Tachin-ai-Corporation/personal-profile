import { afterEach, describe, expect, it, vi } from "vitest"
import { SENSITIVE_SAMPLE } from "@/test/redaction-fixture"
import { bodyForLog, logApiCall, redact } from "./log-api-call"

afterEach(() => vi.unstubAllEnvs())

describe("logApiCall (D6)", () => {
  it.each(["test", "production"])("is silent in %s", (environment) => {
    vi.stubEnv("NODE_ENV", environment)
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    logApiCall({ method: "GET", path: "/api/x", status: 200, durationMs: 1 })
    logApiCall({ method: "GET", path: "/api/1h/v2/health/npi/private-id/is-registered?private", status: 403, durationMs: 1, responseBody: { name: "Private" } })
    expect(group).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(end).not.toHaveBeenCalled()
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
    ["/api/1h/v2/user/organization/portal?name=private#private", "/api/1h/v2/user/organization/portal"],
    ["/api//1h/v2/%75ser/organization/portal/", "/api/1h/v2/user/organization/portal"],
    ["/api/1h/v2/user%2forganization%2fportal", "/api/1h/v2/user/organization/portal"],
    ["/api/1h/v2/user/old/..\t/organization/portal", "/api/1h/v2/user/organization/portal"],
    ["/api/1h/v2/user/organization/por\ntal", "/api/1h/v2/user/organization/portal"],
    ["/api/1h/v2/user/organization/portal\u0000\u001f ", "/api/1h/v2/user/organization/portal"],
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

  it.each([
    ["/api/1h/v2/health/npi/765432109876/is-registered?private#private", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/private-id/is-registered", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/private%2Fid/is-registered?private#private", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/%2F/is-registered?private#private", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/%E0%A4%A/is-registered", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/{npiRecordId}/is-registered", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api//1h/v2/health/%6epi/765432109876//is-registered/", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health%2fnpi%2fprivate-id%2fis-registered", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/health/npi/old/..\t/private-id/is-registered", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/heal\nth/npi/private-id/is-registered \t\r\n", "/api/1h/v2/health/npi/{npiRecordId}/is-registered"],
    ["/api/1h/v2/user/register/npi?private", "/api/1h/v2/user/register/npi"],
    ["/api//1h/v2/%75ser/register/%6epi/", "/api/1h/v2/user/register/npi"],
    ["/api/1h/v2/user%2fregister%2fnpi", "/api/1h/v2/user/register/npi"],
    ["/api/1h/v2/user/old/..\r/register/npi", "/api/1h/v2/user/register/npi"],
    ["/api/pp/practice-support?private#private", "/api/pp/practice-support"],
    ["/api//pp/%70ractice-support/", "/api/pp/practice-support"],
    ["/api/pp%2fpractice-support", "/api/pp/practice-support"],
    ["/api/pp/old/%2e\n%2e/practice-support", "/api/pp/practice-support"],
    ["/api/pp/practice-sup\tport\u0000\u001f ", "/api/pp/practice-support"],
  ])("keeps Provider logs metadata-only for %s", (path, route) => {
    vi.stubEnv("NODE_ENV", "development")
    const group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const end = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined)
    const privateBody = { providerId: 765432109876, practiceId: 678901234567, message: "NPI 1234567890 is taken", name: "Private Support", phone: "+14155552125", email: "private@example.test" }
    for (const status of [200, 400, 403, 409, 500, undefined]) {
      logApiCall({ method: "POST", path, status, durationMs: 7, requestBody: privateBody, responseBody: privateBody })
      expect(group).toHaveBeenLastCalledWith(`[api] POST ${route} → ${status ?? "network error"} (7 ms)`)
    }
    expect(log).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledTimes(6)
    expect(JSON.stringify([group.mock.calls, log.mock.calls, end.mock.calls])).not.toMatch(/765432109876|678901234567|1234567890|private|Private|taken|14155552125|example/)
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
