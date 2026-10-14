// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `lib/server/env.ts` validates at module load, so each case sets `process.env`,
 * resets the module registry and imports it fresh. Boot errors must name the
 * offending variable and never print its value (D1).
 */

const ENV_KEYS = [
  "ONEHEALTH_SECRET_KEY_DEMO",
  "ONEHEALTH_SECRET_KEY_PROD",
  "APP_ID_DEMO",
  "APP_ID_PROD",
  "SESSION_SECRET",
  "SESSION_SECRET_PREVIOUS",
  "PLACES_ENABLED",
  "GOOGLE_PLACES_KEY",
  "PP_DISABLED",
  "ACCOUNT_DISABLED",
  // Superseded names: present in the outer env must change nothing.
  "APP_ENV",
  "APP_ORIGIN",
  "APP_ID",
  "ONEHEALTH_SECRET_KEY",
] as const

const VALID: Record<string, string> = {
  ONEHEALTH_SECRET_KEY_DEMO: "demo-secret-value-1",
  ONEHEALTH_SECRET_KEY_PROD: "prod-secret-value-2",
  APP_ID_DEMO: "app-demo-value-3",
  APP_ID_PROD: "app-prod-value-4",
  SESSION_SECRET: "s".repeat(40),
}

let ORIGINAL_ENV: NodeJS.ProcessEnv

beforeEach(() => {
  ORIGINAL_ENV = process.env
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  vi.resetModules()
})

/** Replace process.env with exactly the given vars, then import env.ts fresh. */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules()
  const next: NodeJS.ProcessEnv = { ...ORIGINAL_ENV }
  for (const key of ENV_KEYS) delete next[key]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) next[k] = v
  process.env = next
  return import("./env")
}

type BootCase = {
  name: string
  vars: Record<string, string | undefined>
  /** `undefined` → boots; otherwise the variable the error must name. */
  error?: RegExp
  /** A value that must never appear in the error message. */
  hidden?: string
}

const SHORT_SECRET = "too-short-secret"

const BOOT_TABLE: BootCase[] = [
  { name: "valid", vars: VALID },
  {
    name: "missing ONEHEALTH_SECRET_KEY_DEMO",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_DEMO: undefined },
    error: /ONEHEALTH_SECRET_KEY_DEMO/,
  },
  {
    name: "missing ONEHEALTH_SECRET_KEY_PROD",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_PROD: undefined },
    error: /ONEHEALTH_SECRET_KEY_PROD/,
  },
  { name: "missing APP_ID_DEMO", vars: { ...VALID, APP_ID_DEMO: undefined }, error: /APP_ID_DEMO/ },
  { name: "missing APP_ID_PROD", vars: { ...VALID, APP_ID_PROD: undefined }, error: /APP_ID_PROD/ },
  { name: "empty APP_ID_PROD", vars: { ...VALID, APP_ID_PROD: "" }, error: /APP_ID_PROD/ },
  { name: "missing SESSION_SECRET", vars: { ...VALID, SESSION_SECRET: undefined }, error: /SESSION_SECRET/ },
  {
    name: "SESSION_SECRET shorter than 32",
    vars: { ...VALID, SESSION_SECRET: SHORT_SECRET },
    error: /SESSION_SECRET/,
    hidden: SHORT_SECRET,
  },
  {
    name: "PLACES_ENABLED=1 without GOOGLE_PLACES_KEY",
    vars: { ...VALID, PLACES_ENABLED: "1" },
    error: /GOOGLE_PLACES_KEY/,
  },
  {
    name: "whitespace-only ONEHEALTH_SECRET_KEY_DEMO",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_DEMO: "  \t\n " },
    error: /ONEHEALTH_SECRET_KEY_DEMO/,
  },
  {
    name: "whitespace-only ONEHEALTH_SECRET_KEY_PROD",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_PROD: "   " },
    error: /ONEHEALTH_SECRET_KEY_PROD/,
  },
  {
    name: "DEMO and PROD keys equal after trim",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_DEMO: "shared-key-value-9", ONEHEALTH_SECRET_KEY_PROD: " shared-key-value-9\n" },
    error: /ONEHEALTH_SECRET_KEY_DEMO \/ ONEHEALTH_SECRET_KEY_PROD/,
    hidden: "shared-key-value-9",
  },
  {
    name: "whitespace around the secret keys is not a boot error",
    vars: { ...VALID, ONEHEALTH_SECRET_KEY_DEMO: "  demo-padded \n", ONEHEALTH_SECRET_KEY_PROD: "\tprod-padded " },
  },
  {
    name: "superseded single-env vars alone do not boot",
    vars: { APP_ENV: "demo", APP_ORIGIN: "https://x.example", APP_ID: "a", ONEHEALTH_SECRET_KEY: "k", SESSION_SECRET: "s".repeat(40) },
    error: /ONEHEALTH_SECRET_KEY_DEMO/,
  },
]

describe("env — boot table", () => {
  it.each(BOOT_TABLE)("$name", async ({ vars, error, hidden }) => {
    const promise = loadEnv(vars)
    if (!error) {
      await expect(promise).resolves.toBeTruthy()
      return
    }
    await expect(promise).rejects.toThrow(error)
    const message = await promise.then(
      () => "",
      (e: unknown) => (e as Error).message,
    )
    for (const value of [hidden, ...Object.values(VALID)].filter(Boolean) as string[]) {
      expect(message).not.toContain(value)
    }
  })
})

describe("env — exports", () => {
  it("exports exactly the D1 set plus the helpers", async () => {
    const env = await loadEnv(VALID)
    expect(Object.keys(env).sort()).toEqual(
      [
        "ACCOUNT_DISABLED",
        "APP_ID_DEMO",
        "APP_ID_PROD",
        "DEFAULT_TENANT_ID",
        "GOOGLE_PLACES_KEY",
        "IS_LOCAL_DEV",
        "ONEHEALTH_SECRET_KEY_DEMO",
        "ONEHEALTH_SECRET_KEY_PROD",
        "PLACES_ENABLED",
        "PP_DISABLED",
        "SESSION_SECRET",
        "SESSION_SECRET_PREVIOUS",
        "getAppId",
        "getSecretKey",
        "getSecretKeyVarName",
      ].sort(),
    )
    expect(env.DEFAULT_TENANT_ID).toBe(1)
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined()
  })

  it("getSecretKey / getAppId return each environment's value as stored", async () => {
    const env = await loadEnv({ ...VALID, ONEHEALTH_SECRET_KEY_PROD: " padded-prod " })
    expect(env.getSecretKey("demo")).toBe("demo-secret-value-1")
    expect(env.getSecretKey("prod")).toBe(" padded-prod ")
    expect(env.getAppId("demo")).toBe("app-demo-value-3")
    expect(env.getAppId("prod")).toBe("app-prod-value-4")
    expect(env.getSecretKeyVarName("prod")).toBe("ONEHEALTH_SECRET_KEY_PROD")
    expect(env.getSecretKeyVarName("demo")).toBe("ONEHEALTH_SECRET_KEY_DEMO")
  })

  it("IS_LOCAL_DEV follows NODE_ENV === development", async () => {
    expect((await loadEnv({ ...VALID, NODE_ENV: "development" })).IS_LOCAL_DEV).toBe(true)
    expect((await loadEnv({ ...VALID, NODE_ENV: "production" })).IS_LOCAL_DEV).toBe(false)
    expect((await loadEnv({ ...VALID, NODE_ENV: "test" })).IS_LOCAL_DEV).toBe(false)
  })
})

describe("env — boolean flags are '1'-only", () => {
  it.each(["PLACES_ENABLED", "PP_DISABLED", "ACCOUNT_DISABLED"] as const)("%s", async (name) => {
    const extra = name === "PLACES_ENABLED" ? { GOOGLE_PLACES_KEY: "places-key" } : {}
    expect((await loadEnv({ ...VALID, ...extra, [name]: "1" }))[name]).toBe(true)
    for (const v of ["true", "", "0", "yes", " 1"]) {
      expect((await loadEnv({ ...VALID, [name]: v }))[name]).toBe(false)
    }
    expect((await loadEnv(VALID))[name]).toBe(false)
  })

  it("GOOGLE_PLACES_KEY is exported when set", async () => {
    const env = await loadEnv({ ...VALID, PLACES_ENABLED: "1", GOOGLE_PLACES_KEY: "places-key" })
    expect(env.GOOGLE_PLACES_KEY).toBe("places-key")
  })
})
