import { afterEach, describe, expect, it, vi } from "vitest"
import { LOGIN_INTENT_KEY, consumeLoginIntent, isSafeIntent, saveLoginIntent } from "./login-intent"

afterEach(() => {
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe("consumeLoginIntent", () => {
  it("returns a stored same-origin path once, then the fallback", () => {
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, "/?tab=insurance")
    expect(consumeLoginIntent("/")).toBe("/?tab=insurance")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBeNull()
    expect(consumeLoginIntent("/")).toBe("/")
  })

  it("keeps a query and hash", () => {
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, "/?tab=contacts#signature")
    expect(consumeLoginIntent("/")).toBe("/?tab=contacts#signature")
  })

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "evil",
    "",
    "/auth",
    "/auth?lpl=x",
    "/auth/x",
    "/api/token",
    "/api",
    "/./auth",
    "/x/../api/1h",
    "/AUTH",
    "/\u0000x",
    `/${"a".repeat(3000)}`,
  ])("refuses %j and removes it", (value) => {
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, value)
    expect(consumeLoginIntent("/")).toBe("/")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBeNull()
  })

  it("falls back when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(consumeLoginIntent("/")).toBe("/")
  })
})

describe("saveLoginIntent", () => {
  it("stores a safe path and ignores an unsafe one", () => {
    saveLoginIntent("/?tab=medical")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBe("/?tab=medical")
    saveLoginIntent("//evil")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBe("/?tab=medical")
    saveLoginIntent("/auth")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBe("/?tab=medical")
  })

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(() => saveLoginIntent("/?tab=insurance")).not.toThrow()
  })
})

describe("isSafeIntent", () => {
  it("accepts / and in-app paths", () => {
    for (const v of ["/", "/?tab=insurance", "/account?tab=personal#account"]) expect(isSafeIntent(v)).toBe(true)
  })

  it("matches whole segments: /authors and /apiary are accepted; /auth/x, /api and /api/x are not", () => {
    for (const v of ["/authors", "/apiary", "/authors?x=1"]) expect(isSafeIntent(v)).toBe(true)
    for (const v of ["/auth", "/auth/x", "/auth?lpl=1", "/api", "/api/x", "/API/x"]) expect(isSafeIntent(v)).toBe(false)
  })
})
