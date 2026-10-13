// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `lib/server/env.ts` validates at module load, so each case sets `process.env`,
 * resets the module registry and imports it fresh. Boot errors must name the
 * offending variable and never print its value.
 */

const ENV_KEYS = [
  "APP_ENV",
  "APP_ORIGIN",
  "APP_ID",
  "ONEHEALTH_SECRET_KEY",
  "SESSION_SECRET",
  "SESSION_SECRET_PREVIOUS",
  "PLACES_ENABLED",
  "GOOGLE_PLACES_KEY",
  "PP_DISABLED",
  "NEXT_PUBLIC_APP_ENV",
] as const

const SESSION_SECRET_VALUE = "a".repeat(40)
const PLACES_KEY_VALUE = "super-secret-places-key"

/** A complete, valid env for the given environment. */
function validEnv(appEnv: string): Record<string, string> {
  return {
    APP_ENV: appEnv,
    APP_ORIGIN: "https://personal-profile-demo.vercel.app",
    APP_ID: "app-id-123",
    ONEHEALTH_SECRET_KEY: "onehealth-secret",
    SESSION_SECRET: SESSION_SECRET_VALUE,
  }
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
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules()
  const next: NodeJS.ProcessEnv = { ...ORIGINAL_ENV }
  for (const key of ENV_KEYS) delete next[key]
  Object.assign(next, vars)
  process.env = next
  return import("./env")
}

describe("env — valid boot per environment", () => {
  it("resolves dev with the dev origin", async () => {
    const env = await loadEnv(validEnv("dev"))
    expect(env.APP_ENV).toBe("dev")
    expect(env.API_ORIGIN).toBe("https://dev.1hdev.io")
    expect(env.PORTAL_ORIGIN).toBe("https://dev.1hdev.io")
    expect(env.PORTAL_URL).toBe("https://dev.1hdev.io/applications")
    expect(env.DEFAULT_TENANT_ID).toBe(1)
  })

  it("resolves demo with the demo origin", async () => {
    const env = await loadEnv(validEnv("demo"))
    expect(env.APP_ENV).toBe("demo")
    expect(env.API_ORIGIN).toBe("https://demo.1health.io")
    expect(env.PORTAL_URL).toBe("https://demo.1health.io/applications")
    expect(env.DEFAULT_TENANT_ID).toBe(1)
  })

  it("resolves prod with the prod origin", async () => {
    const env = await loadEnv(validEnv("prod"))
    expect(env.APP_ENV).toBe("prod")
    expect(env.API_ORIGIN).toBe("https://app.1health.io")
    expect(env.PORTAL_URL).toBe("https://app.1health.io/applications")
  })
})

describe("env — missing required variables", () => {
  const cases: Array<{ name: string; missing: keyof ReturnType<typeof validEnv> }> = [
    { name: "APP_ENV", missing: "APP_ENV" },
    { name: "APP_ORIGIN", missing: "APP_ORIGIN" },
    { name: "APP_ID", missing: "APP_ID" },
    { name: "ONEHEALTH_SECRET_KEY", missing: "ONEHEALTH_SECRET_KEY" },
    { name: "SESSION_SECRET", missing: "SESSION_SECRET" },
  ]

  for (const { name, missing } of cases) {
    it(`throws naming ${name} when it is unset`, async () => {
      const vars = validEnv("demo")
      delete vars[missing]
      await expect(loadEnv(vars)).rejects.toThrow(new RegExp(name))
    })
  }
})

describe("env — invalid values (named, value never printed)", () => {
  it("bad APP_ENV names APP_ENV", async () => {
    await expect(loadEnv({ ...validEnv("demo"), APP_ENV: "staging" })).rejects.toThrow(/APP_ENV/)
  })

  it("non-https APP_ORIGIN names APP_ORIGIN and hides the value", async () => {
    const bad = "http://insecure.example.com"
    const promise = loadEnv({ ...validEnv("demo"), APP_ORIGIN: bad })
    await expect(promise).rejects.toThrow(/APP_ORIGIN/)
    await promise.catch((e: unknown) => {
      expect((e as Error).message).not.toContain(bad)
    })
  })

  it("APP_ORIGIN with a path names APP_ORIGIN", async () => {
    await expect(
      loadEnv({ ...validEnv("demo"), APP_ORIGIN: "https://example.com/launch" }),
    ).rejects.toThrow(/APP_ORIGIN/)
  })

  it("short SESSION_SECRET names SESSION_SECRET and hides the value", async () => {
    const shortSecret = "too-short"
    const promise = loadEnv({ ...validEnv("demo"), SESSION_SECRET: shortSecret })
    await expect(promise).rejects.toThrow(/SESSION_SECRET/)
    await promise.catch((e: unknown) => {
      expect((e as Error).message).not.toContain(shortSecret)
    })
  })

  it("PLACES_ENABLED=1 without GOOGLE_PLACES_KEY names GOOGLE_PLACES_KEY", async () => {
    await expect(
      loadEnv({ ...validEnv("demo"), PLACES_ENABLED: "1" }),
    ).rejects.toThrow(/GOOGLE_PLACES_KEY/)
  })
})

describe("env — boolean parsing is '1'-only", () => {
  it('PLACES_ENABLED is true only for "1"', async () => {
    const enabled = await loadEnv({ ...validEnv("demo"), PLACES_ENABLED: "1", GOOGLE_PLACES_KEY: PLACES_KEY_VALUE })
    expect(enabled.PLACES_ENABLED).toBe(true)
    expect(enabled.GOOGLE_PLACES_KEY).toBe(PLACES_KEY_VALUE)

    for (const v of ["true", "", "0", "yes"]) {
      const env = await loadEnv({ ...validEnv("demo"), PLACES_ENABLED: v })
      expect(env.PLACES_ENABLED).toBe(false)
    }

    const unset = await loadEnv(validEnv("demo"))
    expect(unset.PLACES_ENABLED).toBe(false)
  })

  it('PP_DISABLED is true only for "1"', async () => {
    const on = await loadEnv({ ...validEnv("demo"), PP_DISABLED: "1" })
    expect(on.PP_DISABLED).toBe(true)

    const off = await loadEnv({ ...validEnv("demo"), PP_DISABLED: "true" })
    expect(off.PP_DISABLED).toBe(false)
  })
})
