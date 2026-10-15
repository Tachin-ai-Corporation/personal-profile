import { describe, expect, it, vi } from "vitest"
import { logError, logRequest, logWarning, newRequestId, setLogSink } from "./log"

describe("log", () => {
  it("writes request, error and warning lines as JSON", () => {
    const lines: string[] = []
    const push = (l: string) => void lines.push(l)
    const restore = setLogSink({ info: push, warn: push, error: push })
    logRequest({ requestId: "r1", method: "GET", routeTemplate: "/v2/user/myself", status: 200, durationMs: 3 })
    logError({ requestId: "r2", routeTemplate: "/api/x", status: 500, errorName: "Error" })
    logWarning("a configuration warning")
    restore()
    expect(JSON.parse(lines[0])).toEqual({ kind: "request", requestId: "r1", method: "GET", routeTemplate: "/v2/user/myself", status: 200, durationMs: 3 })
    expect(JSON.parse(lines[1])).toMatchObject({ kind: "error", routeTemplate: "/api/x" })
    expect(JSON.parse(lines[2])).toMatchObject({ kind: "warning" })
  })

  it("uses the console by default", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    logRequest({ requestId: "r", method: "GET", routeTemplate: "/t", status: 200, durationMs: 1 })
    logWarning("w")
    logError({ requestId: "r", routeTemplate: "/t", errorName: "E" })
    expect(info).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })

  it("generates request ids", () => {
    expect(newRequestId()).not.toBe(newRequestId())
  })
})
