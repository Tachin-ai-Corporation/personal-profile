import "server-only"

import { z } from "zod"
import { ENVIRONMENTS, type Environment } from "@/lib/shared/environments"

/**
 * The only reader of server `process.env` (lint-enforced; `lib/shared/app-env.ts`
 * reads `NODE_ENV` only). Validated once, on first use; `instrumentation.ts`
 * calls `assertServerEnv()` at boot so a misconfigured deployment fails
 * immediately. Errors name the offending variable and never print its value.
 * Surrounding whitespace in a secret key is not an error: the launch also
 * tries the trimmed variant (Story 1.2). A blank key, or two keys that are
 * equal after trimming (every payload would detect as prod, D2), fail the boot.
 * Demo and prod are required; dev (D18) is an optional pair: both unset → dev
 * is off, exactly one set → the boot fails naming the missing one.
 */

/** AD-6: the default (patient) tenant. */
export const DEFAULT_TENANT_ID = 1

const required = (name: string): z.ZodString =>
  z.string({ error: `${name} is required` }).min(1, { error: `${name} is required` })

/** Required and not blank; an empty value reports "is required" once (abort), never also "blank". */
const secretKey = (name: string): z.ZodString =>
  z
    .string({ error: `${name} is required` })
    .min(1, { error: `${name} is required`, abort: true })
    .refine((value) => value.trim() !== "", { error: `${name} must not be blank` })

/**
 * The launch credentials the e2e upstream mock requires to be dummy (`e2e-…`)
 * values; the optional dev pair (last two) only when set.
 */
export const E2E_MOCK_CREDENTIALS = [
  "ONEHEALTH_SECRET_KEY_DEMO",
  "ONEHEALTH_SECRET_KEY_PROD",
  "APP_ID_DEMO",
  "APP_ID_PROD",
  "ONEHEALTH_SECRET_KEY_DEV",
  "APP_ID_DEV",
] as const

export type LaunchCredentialName = (typeof E2E_MOCK_CREDENTIALS)[number]

/** The prefix every launch credential must carry while `PP_E2E_MOCK=1`. */
export const E2E_CREDENTIAL_PREFIX = "e2e-"

const sessionSecret = (name: string): z.ZodString =>
  z.string({ error: `${name} is required` }).min(32, { error: `${name} must be at least 32 characters` })

/** `true` only for the exact string "1". */
const flag = z
  .string()
  .optional()
  .transform((value) => value === "1")

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === "" ? undefined : value))

/** The env var holding each environment's secret key and app id. */
const CREDENTIAL_VARIABLES: Readonly<Record<Environment, { readonly secretKey: LaunchCredentialName; readonly appId: LaunchCredentialName }>> = {
  demo: { secretKey: "ONEHEALTH_SECRET_KEY_DEMO", appId: "APP_ID_DEMO" },
  prod: { secretKey: "ONEHEALTH_SECRET_KEY_PROD", appId: "APP_ID_PROD" },
  dev: { secretKey: "ONEHEALTH_SECRET_KEY_DEV", appId: "APP_ID_DEV" },
}

/** The set launch credentials that are not e2e dummies (names only), for the `PP_E2E_MOCK` guards. */
export function nonE2eCredentials(env: Readonly<Partial<Record<LaunchCredentialName, string>>>): LaunchCredentialName[] {
  return E2E_MOCK_CREDENTIALS.filter((name) => {
    const value = env[name]
    return value !== undefined && !value.startsWith(E2E_CREDENTIAL_PREFIX)
  })
}

const envSchema = z
  .object({
    ONEHEALTH_SECRET_KEY_DEMO: secretKey("ONEHEALTH_SECRET_KEY_DEMO"),
    ONEHEALTH_SECRET_KEY_PROD: secretKey("ONEHEALTH_SECRET_KEY_PROD"),
    APP_ID_DEMO: required("APP_ID_DEMO"),
    APP_ID_PROD: required("APP_ID_PROD"),
    ONEHEALTH_SECRET_KEY_DEV: optionalString.pipe(secretKey("ONEHEALTH_SECRET_KEY_DEV").optional()),
    APP_ID_DEV: optionalString,
    SESSION_SECRET: sessionSecret("SESSION_SECRET"),
    SESSION_SECRET_PREVIOUS: optionalString.pipe(sessionSecret("SESSION_SECRET_PREVIOUS").optional()),
    PLACES_ENABLED: flag,
    GOOGLE_PLACES_KEY: optionalString,
    PP_DISABLED: flag,
    ACCOUNT_DISABLED: flag,
    PP_E2E_FIXTURES: flag,
    PP_E2E_MOCK: flag,
    NODE_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // D18: the dev pair is all or nothing; the missing one is named.
    const devKey = env.ONEHEALTH_SECRET_KEY_DEV !== undefined
    const devApp = env.APP_ID_DEV !== undefined
    if (devKey !== devApp) {
      const [missing, present] = devKey ? ["APP_ID_DEV", "ONEHEALTH_SECRET_KEY_DEV"] : ["ONEHEALTH_SECRET_KEY_DEV", "APP_ID_DEV"]
      ctx.addIssue({ code: "custom", path: [missing], message: `${missing} is required when ${present} is set` })
    }
    // Every configured key differs from every other after trimming (D2); both
    // variables of a pair are named (one issue each, one message), never the values.
    const keys = ENVIRONMENTS.flatMap((environment) => {
      const name = CREDENTIAL_VARIABLES[environment].secretKey
      const value = env[name]
      return value === undefined ? [] : [{ name, trimmed: value.trim() }]
    })
    keys.forEach((first, index) => {
      for (const second of keys.slice(index + 1)) {
        if (first.trimmed !== second.trimmed) continue
        for (const name of [first.name, second.name]) {
          ctx.addIssue({ code: "custom", path: [name], message: `${first.name} and ${second.name} must differ` })
        }
      }
    })
    if (env.PP_E2E_MOCK) {
      // The mock fakes 1health: never boot it next to real credentials (names only, never values).
      for (const name of nonE2eCredentials(env)) {
        ctx.addIssue({ code: "custom", path: [name], message: `${name} must be an e2e dummy value ("${E2E_CREDENTIAL_PREFIX}…") when PP_E2E_MOCK=1` })
      }
    }
    if (env.PLACES_ENABLED && !env.GOOGLE_PLACES_KEY) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_PLACES_KEY"], message: "GOOGLE_PLACES_KEY is required when PLACES_ENABLED=1" })
    }
  })

export interface ServerEnv {
  readonly ONEHEALTH_SECRET_KEY_DEMO: string
  readonly ONEHEALTH_SECRET_KEY_PROD: string
  readonly APP_ID_DEMO: string
  readonly APP_ID_PROD: string
  /** Optional dev pair (D18): both set or both `undefined`. */
  readonly ONEHEALTH_SECRET_KEY_DEV: string | undefined
  readonly APP_ID_DEV: string | undefined
  /** The environments this deployment can launch: demo, prod, and dev when its pair is set (`ENVIRONMENTS` order). */
  readonly configuredEnvironments: readonly Environment[]
  readonly SESSION_SECRET: string
  readonly SESSION_SECRET_PREVIOUS: string | undefined
  readonly PLACES_ENABLED: boolean
  readonly GOOGLE_PLACES_KEY: string | undefined
  readonly PP_DISABLED: boolean
  readonly ACCOUNT_DISABLED: boolean
  /** Serves the Playwright fixture pages under `/test-fixtures/**` (never set in a deployment). */
  readonly PP_E2E_FIXTURES: boolean
  /** Installs the server-side e2e upstream mock (`test/e2e-upstream-mock.ts`; Playwright only, never set in a deployment). */
  readonly PP_E2E_MOCK: boolean
  /** `NODE_ENV === "development"`. */
  readonly IS_LOCAL_DEV: boolean
  /** The External Application secret key of an environment, as stored (`""` for an unconfigured dev). */
  getSecretKey(environment: Environment): string
  /** The External Application id of an environment (`""` for an unconfigured dev). */
  getAppId(environment: Environment): string
}

export class ServerEnvError extends Error {
  constructor(readonly variables: readonly string[], messages: readonly string[]) {
    super(`Invalid server environment: ${[...new Set(messages)].join("; ")}`)
    this.name = "ServerEnvError"
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>

/** Pure parser, exported for the table test. */
export function parseServerEnv(source: EnvSource): ServerEnv {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new ServerEnvError(
      result.error.issues.map((issue) => String(issue.path[0])),
      result.error.issues.map((issue) => issue.message),
    )
  }
  const env = result.data
  const secretKeys: Record<Environment, string> = {
    demo: env.ONEHEALTH_SECRET_KEY_DEMO,
    prod: env.ONEHEALTH_SECRET_KEY_PROD,
    dev: env.ONEHEALTH_SECRET_KEY_DEV ?? "",
  }
  const appIds: Record<Environment, string> = { demo: env.APP_ID_DEMO, prod: env.APP_ID_PROD, dev: env.APP_ID_DEV ?? "" }
  const configuredEnvironments = ENVIRONMENTS.filter((environment) => environment !== "dev" || env.ONEHEALTH_SECRET_KEY_DEV !== undefined)
  return {
    ONEHEALTH_SECRET_KEY_DEMO: env.ONEHEALTH_SECRET_KEY_DEMO,
    ONEHEALTH_SECRET_KEY_PROD: env.ONEHEALTH_SECRET_KEY_PROD,
    APP_ID_DEMO: env.APP_ID_DEMO,
    APP_ID_PROD: env.APP_ID_PROD,
    ONEHEALTH_SECRET_KEY_DEV: env.ONEHEALTH_SECRET_KEY_DEV,
    APP_ID_DEV: env.APP_ID_DEV,
    configuredEnvironments,
    SESSION_SECRET: env.SESSION_SECRET,
    SESSION_SECRET_PREVIOUS: env.SESSION_SECRET_PREVIOUS,
    PLACES_ENABLED: env.PLACES_ENABLED,
    GOOGLE_PLACES_KEY: env.GOOGLE_PLACES_KEY,
    PP_DISABLED: env.PP_DISABLED,
    ACCOUNT_DISABLED: env.ACCOUNT_DISABLED,
    PP_E2E_FIXTURES: env.PP_E2E_FIXTURES,
    PP_E2E_MOCK: env.PP_E2E_MOCK,
    IS_LOCAL_DEV: env.NODE_ENV === "development",
    getSecretKey: (environment) => secretKeys[environment],
    getAppId: (environment) => appIds[environment],
  }
}

/** The env var name holding an environment's secret key (for warnings; never the value). */
export function secretKeyVariable(environment: Environment): string {
  return CREDENTIAL_VARIABLES[environment].secretKey
}

let cached: ServerEnv | undefined

/** The validated server env (parsed once per process). */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}

/** Boot-time check, called from `instrumentation.ts`. Throws `ServerEnvError`. */
export function assertServerEnv(): void {
  serverEnv()
}

/** Test hook: forget the cached env so a test can swap `process.env`. */
export function resetServerEnvCache(): void {
  cached = undefined
}
