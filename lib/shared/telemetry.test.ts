import { describe, expect, it, vi } from "vitest"
import { setTelemetrySink, telemetry } from "./telemetry"

describe("telemetry", () => {
  it("is a no-op by default", () => {
    expect(() => telemetry.track("save_all", { saved: 1, failed: 0 })).not.toThrow()
  })

  it("sends typed events to the installed sink and restores the previous one", () => {
    const sink = vi.fn()
    const restore = setTelemetrySink(sink)
    telemetry.track("section_save", { sectionId: "phone", ok: false, code: "FORBIDDEN" })
    telemetry.track("save_all", { saved: 2, failed: 1 })
    telemetry.track("mfa_link", { ok: true, attempt: 1 })
    restore()
    telemetry.track("save_all", { saved: 0, failed: 0 })
    expect(sink.mock.calls).toEqual([
      ["section_save", { sectionId: "phone", ok: false, code: "FORBIDDEN" }],
      ["save_all", { saved: 2, failed: 1 }],
      ["mfa_link", { ok: true, attempt: 1 }],
    ])
  })

  it("never lets a failing sink reach the caller", () => {
    const restore = setTelemetrySink(() => {
      throw new Error("sink down")
    })
    expect(() => telemetry.track("mfa_link", { ok: false, attempt: 2 })).not.toThrow()
    restore()
  })
})
