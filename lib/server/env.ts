import "server-only"

import { z } from "zod"
import type { Environment } from "@/lib/shared/environments"

/**
 * The only reader of server `process.env` (lint-enforced; `lib/shared/app-env.ts`
 * reads `NODE_ENV` only). Validated once, on first use; `instrumentation.ts`
 * calls `assertServerEnv()` at boot so a misconfigured deployment fails
 * immediately. Errors name the offending variable and never print its value.
 * Surrounding whitespace in a secret key is not an error: the launch also
 * tries the trimmed variant (Story 1.2).
 */

/** AD-6: the default (patient) tenant. */
export const DEFAULT_TENANT_ID = 1

const required = (name: string): z.ZodString =>
  z.string({ error: `${name} is required` }).min(1, { error: `${name} is required` })

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

const envSchema = z
  .object({
    ONEHEALTH_SECRET_KEY_DEMO: required("ONEHEALTH_SECRET_KEY_DEMO"),
    ONEHEALTH_SECRET_KEY_PROD: required("ONEHEALTH_SECRET_KEY_PROD"),
    APP_ID_DEMO: required("APP_ID_DEMO"),
    APP_ID_PROD: required("APP_ID_PROD"),
    SESSION_SECRET: sessionSecret("SESSION_SECRET"),
    SESSION_SECRET_PREVIOUS: optionalString.pipe(sessionSecret("SESSION_SECRET_PREVIOUS").optional()),
    PLACES_ENABLED: flag,
    GOOGLE_PLACES_KEY: optionalString,
    PP_DISABLED: flag,
    ACCOUNT_DISABLED: flag,
    PP_E2E_FIXTURES: flag,
    NODE_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PLACES_ENABLED && !env.GOOGLE_PLACES_KEY) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_PLACES_KEY"], message: "GOOGLE_PLACES_KEY is required when PLACES_ENABLED=1" })
    }
  })

export interface ServerEnv {
  readonly ONEHEALTH_SECRET_KEY_DEMO: string
  readonly ONEHEALTH_SECRET_KEY_PROD: string
  readonly APP_ID_DEMO: string
  readonly APP_ID_PROD: string
  readonly SESSION_SECRET: string
  readonly SESSION_SECRET_PREVIOUS: string | undefined
  readonly PLACES_ENABLED: boolean
  readonly GOOGLE_PLACES_KEY: string | undefined
  readonly PP_DISABLED: boolean
  readonly ACCOUNT_DISABLED: boolean
  /** Serves the Playwright fixture pages under `/test-fixtures/**` (never set in a deployment). */
  readonly PP_E2E_FIXTURES: boolean
  /** `NODE_ENV === "development"`. */
  readonly IS_LOCAL_DEV: boolean
  /** The External Application secret key of an environment, as stored. */
  getSecretKey(environment: Environment): string
  /** The External Application id of an environment. */
  getAppId(environment: Environment): string
}

export class ServerEnvError extends Error {
  constructor(readonly variables: readonly string[], messages: readonly string[]) {
    super(`Invalid server environment: ${messages.join("; ")}`)
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
  const secretKeys: Record<Environment, string> = { demo: env.ONEHEALTH_SECRET_KEY_DEMO, prod: env.ONEHEALTH_SECRET_KEY_PROD }
  const appIds: Record<Environment, string> = { demo: env.APP_ID_DEMO, prod: env.APP_ID_PROD }
  return {
    ONEHEALTH_SECRET_KEY_DEMO: env.ONEHEALTH_SECRET_KEY_DEMO,
    ONEHEALTH_SECRET_KEY_PROD: env.ONEHEALTH_SECRET_KEY_PROD,
    APP_ID_DEMO: env.APP_ID_DEMO,
    APP_ID_PROD: env.APP_ID_PROD,
    SESSION_SECRET: env.SESSION_SECRET,
    SESSION_SECRET_PREVIOUS: env.SESSION_SECRET_PREVIOUS,
    PLACES_ENABLED: env.PLACES_ENABLED,
    GOOGLE_PLACES_KEY: env.GOOGLE_PLACES_KEY,
    PP_DISABLED: env.PP_DISABLED,
    ACCOUNT_DISABLED: env.ACCOUNT_DISABLED,
    PP_E2E_FIXTURES: env.PP_E2E_FIXTURES,
    IS_LOCAL_DEV: env.NODE_ENV === "development",
    getSecretKey: (environment) => secretKeys[environment],
    getAppId: (environment) => appIds[environment],
  }
}

/** The env var name holding an environment's secret key (for warnings; never the value). */
export function secretKeyVariable(environment: Environment): string {
  return environment === "demo" ? "ONEHEALTH_SECRET_KEY_DEMO" : "ONEHEALTH_SECRET_KEY_PROD"
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
