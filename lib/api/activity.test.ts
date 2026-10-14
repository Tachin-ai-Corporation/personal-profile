import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeBroadcastChannel } from "../../test/fake-broadcast-channel"

/**
 * `lib/api/activity.ts` (Story 1.6) over a fake `BroadcastChannel`. Each test
 * imports the module fresh so its lazily opened channel is the fake one.
 */

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.restoreAllMocks()
})

async function load() {
  vi.resetModules()
  const mod = await import("./activity")
  mod.__resetActivityForTests()
  return mod
}

function channel(): FakeBroadcastChannel {
  const open = FakeBroadcastChannel.instances.filter((c) => !c.closed)
  expect(open).toHaveLength(1)
  expect(open[0].name).toBe("pp-activity")
  return open[0]
}

describe("noteActivity", () => {
  it("records t, notifies subscribers and posts exactly { t }", async () => {
    const { noteActivity, subscribeActivity, lastActivityAt } = await load()
    const cb = vi.fn()
    subscribeActivity(cb)
    noteActivity(1_000)
    expect(lastActivityAt()).toBe(1_000)
    expect(cb).toHaveBeenCalledWith(1_000)
    const posted = channel().posted
    expect(posted).toEqual([{ t: 1_000 }])
    expect(Object.keys(posted[0] as object)).toEqual(["t"])
  })

  it("keeps the max: an older t never moves lastActivityAt back", async () => {
    const { noteActivity, lastActivityAt } = await load()
    noteActivity(2_000)
    noteActivity(1_500)
    expect(lastActivityAt()).toBe(2_000)
  })

  it("ignores non-finite values", async () => {
    const { noteActivity, lastActivityAt } = await load()
    noteActivity(Number.NaN)
    noteActivity(Number.POSITIVE_INFINITY)
    expect(lastActivityAt()).toBe(0)
    expect(channel().posted).toEqual([])
  })

  it("unsubscribe stops notifications; a throwing subscriber is isolated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { noteActivity, subscribeActivity } = await load()
    const bad = vi.fn(() => {
      throw new Error("boom")
    })
    const good = vi.fn()
    subscribeActivity(bad)
    const off = subscribeActivity(good)
    noteActivity(1)
    expect(good).toHaveBeenCalledOnce()
    off()
    noteActivity(2)
    expect(good).toHaveBeenCalledOnce()
  })
})

describe("incoming channel messages", () => {
  it("a valid { t } is recorded and notified but never re-broadcast", async () => {
    const { subscribeActivity, lastActivityAt } = await load()
    const cb = vi.fn()
    subscribeActivity(cb)
    channel().deliver({ t: 5_000 })
    expect(lastActivityAt()).toBe(5_000)
    expect(cb).toHaveBeenCalledWith(5_000)
    expect(channel().posted).toEqual([])
  })

  it.each([
    ["{ t: 'x' }", { t: "x" }],
    ["{ t: 1, id: 2 }", { t: 1, id: 2 }],
    ["null", null],
    ["{}", {}],
    ["[1]", [1]],
    ["a number", 7],
    ["{ t: NaN }", { t: Number.NaN }],
    ["{ t: Infinity }", { t: Number.POSITIVE_INFINITY }],
  ])("%s is ignored", async (_label, data) => {
    const { subscribeActivity, lastActivityAt } = await load()
    const cb = vi.fn()
    subscribeActivity(cb)
    channel().deliver(data)
    expect(lastActivityAt()).toBe(0)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe("without BroadcastChannel", () => {
  it("everything stays local", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    const { noteActivity, subscribeActivity, lastActivityAt } = await load()
    const cb = vi.fn()
    subscribeActivity(cb)
    noteActivity(3_000)
    expect(lastActivityAt()).toBe(3_000)
    expect(cb).toHaveBeenCalledWith(3_000)
    expect(FakeBroadcastChannel.instances).toHaveLength(0)
  })
})
