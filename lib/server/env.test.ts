import { afterEach, describe, expect, it, vi } from "vitest"
import { TEST_ENV } from "@/test/env-fixture"
import { assertServerEnv, DEFAULT_TENANT_ID, parseServerEnv, resetServerEnvCache, secretKeyVariable, serverEnv, ServerEnvError } from "./env"

const valid = { ...TEST_ENV }

function failure(source: Record<string, string | undefined>): ServerEnvError {
  try {
    parseServerEnv(source)
  } catch (error) {
    if (error instanceof ServerEnvError) return error
    throw error
  }
  throw new Error("expected parseServerEnv to throw")
}

describe("parseServerEnv", () => {
  it("parses a valid env", () => {
    const env = parseServerEnv(valid)
    expect(env.ONEHEALTH_SECRET_KEY_DEMO).toBe(valid.ONEHEALTH_SECRET_KEY_DEMO)
    expect(env.getSecretKey("prod")).toBe(valid.ONEHEALTH_SECRET_KEY_PROD)
    expect(env.getSecretKey("demo")).toBe(valid.ONEHEALTH_SECRET_KEY_DEMO)
    expect(env.getAppId("demo")).toBe(valid.APP_ID_DEMO)
    expect(env.getAppId("prod")).toBe(valid.APP_ID_PROD)
    expect(env.APP_ID_PROD).toBe(valid.APP_ID_PROD)
    expect(env.SESSION_SECRET).toBe(valid.SESSION_SECRET)
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined()
    expect(env.PP_DISABLED).toBe(false)
    expect(env.ACCOUNT_DISABLED).toBe(false)
    expect(env.PP_E2E_FIXTURES).toBe(false)
    expect(env.PP_E2E_MOCK).toBe(false)
    expect(env.PLACES_ENABLED).toBe(false)
    expect(env.GOOGLE_PLACES_KEY).toBeUndefined()
    expect(env.IS_LOCAL_DEV).toBe(false)
    expect(DEFAULT_TENANT_ID).toBe(1)
  })

  it.each([
    ["ONEHEALTH_SECRET_KEY_DEMO", { ONEHEALTH_SECRET_KEY_DEMO: undefined }],
    ["ONEHEALTH_SECRET_KEY_PROD", { ONEHEALTH_SECRET_KEY_PROD: "" }],
    ["APP_ID_DEMO", { APP_ID_DEMO: undefined }],
    ["APP_ID_PROD", { APP_ID_PROD: "" }],
    ["SESSION_SECRET", { SESSION_SECRET: undefined }],
    ["SESSION_SECRET", { SESSION_SECRET: "too-short-but-secret-value" }],
    ["SESSION_SECRET_PREVIOUS", { SESSION_SECRET_PREVIOUS: "short-previous-value" }],
    ["GOOGLE_PLACES_KEY", { PLACES_ENABLED: "1" }],
  ])("fails naming %s and never printing the value", (name, override) => {
    const error = failure({ ...valid, ...override })
    expect(error.variables).toContain(name)
    expect(error.message).toContain(name)
    for (const value of Object.values(override)) {
      if (value && value !== "1") expect(error.message).not.toContain(value)
    }
  })

  it("names each environment's secret key variable", () => {
    expect(secretKeyVariable("demo")).toBe("ONEHEALTH_SECRET_KEY_DEMO")
    expect(secretKeyVariable("prod")).toBe("ONEHEALTH_SECRET_KEY_PROD")
  })

  it("does not fail on whitespace around a secret key", () => {
    expect(parseServerEnv({ ...valid, ONEHEALTH_SECRET_KEY_PROD: "  padded-key \n" }).getSecretKey("prod")).toBe("  padded-key \n")
  })

  it.each(["ONEHEALTH_SECRET_KEY_DEMO", "ONEHEALTH_SECRET_KEY_PROD"])("fails on a whitespace-only %s, naming it", (name) => {
    const error = failure({ ...valid, [name]: " \t\n " })
    expect(error.variables).toEqual([name])
    expect(error.message).toBe(`Invalid server environment: ${name} must not be blank`)
  })

  it.each([
    ["identical", "same-secret-key-value", "same-secret-key-value"],
    ["equal after trim", "  same-secret-key-value\n", "same-secret-key-value "],
  ])("fails when the demo and prod keys are %s, naming both variables and never the value", (_label, demo, prod) => {
    const error = failure({ ...valid, ONEHEALTH_SECRET_KEY_DEMO: demo, ONEHEALTH_SECRET_KEY_PROD: prod })
    expect(error.variables).toEqual(["ONEHEALTH_SECRET_KEY_DEMO", "ONEHEALTH_SECRET_KEY_PROD"])
    expect(error.message).toBe("Invalid server environment: ONEHEALTH_SECRET_KEY_DEMO and ONEHEALTH_SECRET_KEY_PROD must differ")
    expect(error.message).not.toContain("same-secret-key-value")
  })

  it("accepts Places with a key, a previous secret, and treats empty optionals as unset", () => {
    const previous = "p".repeat(40)
    const env = parseServerEnv({ ...valid, PLACES_ENABLED: "1", GOOGLE_PLACES_KEY: "k", SESSION_SECRET_PREVIOUS: previous })
    expect(env.PLACES_ENABLED).toBe(true)
    expect(env.GOOGLE_PLACES_KEY).toBe("k")
    expect(env.SESSION_SECRET_PREVIOUS).toBe(previous)
    expect(parseServerEnv({ ...valid, SESSION_SECRET_PREVIOUS: "" }).SESSION_SECRET_PREVIOUS).toBeUndefined()
  })

  it.each([
    ["1", true],
    ["true", false],
    ["0", false],
    [undefined, false],
  ])("PP_DISABLED/ACCOUNT_DISABLED/PP_E2E_FIXTURES/PP_E2E_MOCK=%s → %s (only the exact string \"1\")", (value, expected) => {
    const env = parseServerEnv({ ...valid, PP_DISABLED: value, ACCOUNT_DISABLED: value, PP_E2E_FIXTURES: value, PP_E2E_MOCK: value })
    expect(env.PP_DISABLED).toBe(expected)
    expect(env.ACCOUNT_DISABLED).toBe(expected)
    expect(env.PP_E2E_FIXTURES).toBe(expected)
    expect(env.PP_E2E_MOCK).toBe(expected)
  })

  it("flags local development", () => {
    expect(parseServerEnv({ ...valid, NODE_ENV: "development" }).IS_LOCAL_DEV).toBe(true)
  })
})

describe("serverEnv", () => {
  afterEach(() => resetServerEnvCache())

  it("reads process.env once and caches it", () => {
    for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value)
    resetServerEnvCache()
    const first = serverEnv()
    vi.stubEnv("SESSION_SECRET", "x".repeat(64))
    expect(serverEnv()).toBe(first)
    expect(() => assertServerEnv()).not.toThrow()
  })

  it("fails at boot when misconfigured", () => {
    vi.stubEnv("SESSION_SECRET", "short")
    resetServerEnvCache()
    expect(() => assertServerEnv()).toThrow(ServerEnvError)
  })
})
