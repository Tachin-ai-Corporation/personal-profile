import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeBroadcastChannel } from "@/test/fake-broadcast-channel"
import { ACTIVITY_CHANNEL, createActivity, type Activity } from "./activity"

let activity: Activity

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
  activity = createActivity()
})

afterEach(() => activity.reset())

const channel = () => FakeBroadcastChannel.open(ACTIVITY_CHANNEL)

describe("note", () => {
  it("records t, notifies subscribers and posts exactly { t } on pp-activity", () => {
    const listener = vi.fn()
    activity.subscribe(listener)
    activity.note(1_000)
    expect(ACTIVITY_CHANNEL).toBe("pp-activity")
    expect(activity.lastAt()).toBe(1_000)
    expect(listener).toHaveBeenCalledWith(1_000)
    expect(channel().posted).toEqual([{ t: 1_000 }])
    expect(Object.keys(channel().posted[0] as object)).toEqual(["t"])
  })

  it("keeps the max: an older t never moves lastAt back", () => {
    activity.note(2_000)
    activity.note(1_500)
    expect(activity.lastAt()).toBe(2_000)
  })

  it("ignores non-finite values", () => {
    activity.note(Number.NaN)
    activity.note(Number.POSITIVE_INFINITY)
    expect(activity.lastAt()).toBe(0)
    expect(channel().posted).toEqual([])
  })

  it("unsubscribe stops notifications; a throwing listener is isolated", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    activity.subscribe(() => {
      throw new Error("boom")
    })
    const good = vi.fn()
    const off = activity.subscribe(good)
    activity.note(1)
    expect(good).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
    off()
    activity.note(2)
    expect(good).toHaveBeenCalledOnce()
  })

  it("a failing channel leaves the activity local", () => {
    activity.subscribe(() => undefined)
    channel().close()
    activity.note(5)
    expect(activity.lastAt()).toBe(5)
  })
})

describe("incoming channel messages", () => {
  it("a valid { t } is recorded and notified but never re-broadcast", () => {
    const listener = vi.fn()
    activity.subscribe(listener)
    channel().deliver({ t: 5_000 })
    expect(activity.lastAt()).toBe(5_000)
    expect(listener).toHaveBeenCalledWith(5_000)
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
  ])("%s is ignored", (_label, data) => {
    const listener = vi.fn()
    activity.subscribe(listener)
    channel().deliver(data)
    expect(activity.lastAt()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe("channel lifecycle", () => {
  it("opens one channel lazily and reset closes it", () => {
    expect(FakeBroadcastChannel.instances).toHaveLength(0)
    expect(activity.lastAt()).toBe(0)
    activity.subscribe(() => undefined)
    expect(FakeBroadcastChannel.instances).toHaveLength(1)
    activity.reset()
    expect(FakeBroadcastChannel.instances[0].closed).toBe(true)
    activity.note(1)
    expect(FakeBroadcastChannel.instances).toHaveLength(2)
  })

  it("without BroadcastChannel everything stays local", () => {
    vi.stubGlobal("BroadcastChannel", undefined)
    const local = createActivity()
    const listener = vi.fn()
    local.subscribe(listener)
    local.note(3_000)
    expect(local.lastAt()).toBe(3_000)
    expect(listener).toHaveBeenCalledWith(3_000)
    expect(FakeBroadcastChannel.instances).toHaveLength(0)
    local.reset()
  })

  it("a BroadcastChannel that cannot be opened → local only", () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("denied")
        }
      },
    )
    const local = createActivity()
    local.note(9)
    expect(local.lastAt()).toBe(9)
  })
})
