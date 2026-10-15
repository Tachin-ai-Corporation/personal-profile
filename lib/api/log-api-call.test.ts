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

  it("parses bodies for display", () => {
    expect(bodyForLog(undefined)).toBeUndefined()
    expect(bodyForLog("")).toBeUndefined()
    expect(bodyForLog('{"a":1}')).toEqual({ a: 1 })
    expect(bodyForLog("plain")).toBe("plain")
  })
})
