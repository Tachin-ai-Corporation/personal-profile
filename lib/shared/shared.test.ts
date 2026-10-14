import { describe, expect, it, vi } from "vitest"
import { isLocalDev, isProductionBuild } from "./app-env"
import { consumeLaunchIntent, consumeLoginIntent, isValidIntent, LOGIN_INTENT_KEY, normalizeIntent, saveLoginIntent, type IntentStorage } from "./login-intent"
import { LAUNCH_MESSAGES } from "./messages"

function memoryStorage(): IntentStorage & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

describe("isLocalDev", () => {
  it("is true only under NODE_ENV=development", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(isLocalDev()).toBe(true)
    vi.stubEnv("NODE_ENV", "test")
    expect(isLocalDev()).toBe(false)
  })
})

describe("isProductionBuild", () => {
  it("is true only under NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(isProductionBuild()).toBe(true)
    vi.stubEnv("NODE_ENV", "test")
    expect(isProductionBuild()).toBe(false)
  })
})

describe("launch intent (/ only)", () => {
  it.each([
    ["/?tab=insurance", "/?tab=insurance"],
    ["/", "/"],
    ["/account?tab=provider", "/"],
    ["/account", "/"],
    ["//evil.test", "/"],
    ["/auth", "/"],
  ])("a saved %s lands on %s and is removed", (saved, expected) => {
    const storage = memoryStorage()
    storage.setItem(LOGIN_INTENT_KEY, saved)
    expect(consumeLaunchIntent(storage)).toBe(expected)
    expect(storage.map.has(LOGIN_INTENT_KEY)).toBe(false)
  })

  it("lands on / with nothing saved or no storage", () => {
    expect(consumeLaunchIntent(memoryStorage())).toBe("/")
    expect(consumeLaunchIntent(undefined)).toBe("/")
  })
})

describe("login intent", () => {
  it.each([
    ["/", true],
    ["/account?tab=personal", true],
    ["/authority", true],
    ["//evil.test", false],
    ["https://evil.test", false],
    ["/auth", false],
    ["/auth?lpl=x", false],
    ["/auth/x", false],
    ["/api/1h/x", false],
    ["/\\evil.test", false],
    ["/\t/evil.com", false],
    ["/\n/evil.com", false],
    ["/\r/evil.com", false],
    ["/x/../auth", false],
    ["/x/../api/session/logout", false],
    ["/x/./account", true],
    ["relative", false],
  ])("validates %s → %s", (path, expected) => {
    expect(isValidIntent(path)).toBe(expected)
  })

  it("returns the parsed pathname + search", () => {
    expect(normalizeIntent("/x/../account?tab=personal#h")).toBe("/account?tab=personal")
    expect(normalizeIntent("/x/../auth")).toBeNull()
  })

  it("saves pathname + search, then reads and removes it once", () => {
    const storage = memoryStorage()
    saveLoginIntent("/account?tab=personal#account", storage)
    expect(storage.map.get(LOGIN_INTENT_KEY)).toBe("/account?tab=personal")
    expect(consumeLoginIntent("/", storage)).toBe("/account?tab=personal")
    expect(consumeLoginIntent("/", storage)).toBe("/")
  })

  it("ignores invalid intents and falls back on a tampered value", () => {
    const storage = memoryStorage()
    saveLoginIntent("/auth", storage)
    expect(storage.map.size).toBe(0)
    storage.setItem(LOGIN_INTENT_KEY, "//evil.test")
    expect(consumeLoginIntent("/", storage)).toBe("/")
    expect(storage.map.size).toBe(0)
  })

  it("survives missing or failing storage", () => {
    expect(consumeLoginIntent("/fallback", undefined)).toBe("/fallback")
    expect(() => saveLoginIntent("/x", undefined)).not.toThrow()
    const broken: IntentStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("full")
      },
      removeItem: () => undefined,
    }
    expect(consumeLoginIntent("/fallback", broken)).toBe("/fallback")
    expect(() => saveLoginIntent("/x", broken)).not.toThrow()
  })

  it("uses window.sessionStorage by default, and nothing without a window", () => {
    expect(consumeLoginIntent("/no-window")).toBe("/no-window")
    const storage = memoryStorage()
    vi.stubGlobal("window", { sessionStorage: storage })
    saveLoginIntent("/account")
    expect(consumeLoginIntent("/")).toBe("/account")
    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("denied")
      },
    })
    expect(consumeLoginIntent("/denied")).toBe("/denied")
  })
})

describe("messages", () => {
  it("formats environment labels", () => {
    expect(LAUNCH_MESSAGES.connectingTo("Demo")).toBe("Connecting to Demo environment")
    expect(LAUNCH_MESSAGES.goTo1health("Production")).toBe("Go to 1health (Production)")
    expect(LAUNCH_MESSAGES.manualDescription("Demo")).toBe("Connected to Demo environment. No launch payload detected.")
  })
})
