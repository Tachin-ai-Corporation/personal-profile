import { afterEach, describe, expect, it, vi } from "vitest"
import { __resetSessionEventsForTests, publish, subscribe } from "./session-events"

afterEach(() => __resetSessionEventsForTests())

describe("session-events", () => {
  it("notifies subscribers only the first time per event", () => {
    const cb = vi.fn()
    subscribe("session-expired", cb)
    publish("session-expired")
    publish("session-expired")
    expect(cb).toHaveBeenCalledOnce()
  })

  it("tracks each event separately", () => {
    const expired = vi.fn()
    const changed = vi.fn()
    subscribe("session-expired", expired)
    subscribe("session-changed", changed)
    publish("session-changed")
    expect(changed).toHaveBeenCalledOnce()
    expect(expired).not.toHaveBeenCalled()
    publish("session-expired")
    expect(expired).toHaveBeenCalledOnce()
  })

  it("unsubscribe stops notifications", () => {
    const cb = vi.fn()
    const off = subscribe("session-changed", cb)
    off()
    publish("session-changed")
    expect(cb).not.toHaveBeenCalled()
  })

  it("a throwing subscriber does not break publish or other subscribers", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const after = vi.fn()
    subscribe("session-expired", () => {
      throw new Error("boom")
    })
    subscribe("session-expired", after)
    expect(() => publish("session-expired")).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it("the test reset allows publishing again", () => {
    const cb = vi.fn()
    subscribe("session-expired", cb)
    publish("session-expired")
    __resetSessionEventsForTests()
    subscribe("session-expired", cb)
    publish("session-expired")
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
