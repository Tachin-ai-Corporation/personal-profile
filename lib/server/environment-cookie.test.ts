// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "onehealth_environment" && cookieValue.current !== undefined ? { value: cookieValue.current } : undefined,
  }),
}))

import { ENVIRONMENT_COOKIE_NAME, environmentCookie, readEnvironmentCookie } from "./environment-cookie"

afterEach(() => {
  cookieValue.current = undefined
})

describe("onehealth_environment (D4)", () => {
  it("is HttpOnly, Secure, Lax, Path=/ with a 30-day Max-Age", () => {
    expect(ENVIRONMENT_COOKIE_NAME).toBe("onehealth_environment")
    expect(environmentCookie("demo")).toBe("onehealth_environment=demo; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000")
    expect(environmentCookie("prod")).toBe("onehealth_environment=prod; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000")
  })

  it.each([
    [undefined, null],
    ["demo", "demo"],
    ["prod", "prod"],
    ["dev", null],
    ["PROD", null],
    ["", null],
  ])("reads %j as %s", async (value, expected) => {
    cookieValue.current = value
    expect(await readEnvironmentCookie()).toBe(expected)
  })
})
