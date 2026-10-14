import "server-only"

import type { Environment } from "@/lib/shared/environments"

/**
 * =============================================================================
 * Server environment — the single reader of server `process.env` (D1)
 * =============================================================================
 *
 * This module (and only this module) reads server-side `process.env`. The one
 * other exception is `lib/shared/app-env.ts#isLocalDev()`, which reads only
 * `process.env.NODE_ENV` (D6). ESLint enforces both (see `eslint.config.mjs`).
 *
 * Validation runs at module load. `instrumentation.ts` imports this module from
 * `register()` so a missing or invalid required variable fails the boot. Boot
 * errors name the offending variable but NEVER print its value.
 *
 * One deployment serves demo and prod (D1). The environment of a session is the
 * one whose key decrypted its launch payload (D2), so each secret exists once
 * per environment. No 1health origin comes from an env var: origins live in
 * `lib/shared/environments.ts` (D4).
 *
 * Secret keys are returned exactly as stored. Whitespace around a key is not a
 * boot error: the launch tries the trimmed variant and warns (Story 1.2).
 * =============================================================================
 */

/** A boolean env flag is `true` only for the exact string "1"; everything else is `false`. */
function bool(v: string | undefined): boolean {
  return v === "1"
}

/** Read a required variable; throw naming it (never its value) when missing/empty. */
function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(`[env] Missing required variable: ${name}`)
  }
  return v
}

/** Read an optional variable; returns `undefined` when unset or empty. */
function optional(name: string): string | undefined {
  const v = process.env[name]
  return v ? v : undefined
}

function resolveSessionSecret(): string {
  const raw = required("SESSION_SECRET")
  if (raw.length < 32) {
    throw new Error(`[env] Invalid value for SESSION_SECRET (must be at least 32 characters)`)
  }
  return raw
}

function resolveGooglePlacesKey(placesEnabled: boolean): string | undefined {
  const key = optional("GOOGLE_PLACES_KEY")
  if (placesEnabled && !key) {
    throw new Error(`[env] Missing required variable: GOOGLE_PLACES_KEY (required when PLACES_ENABLED=1)`)
  }
  return key
}

/**
 * Read a secret key: required, and not blank after `.trim()` (a blank key can
 * never form an AES key, so every launch would fail). Surrounding whitespace on
 * a non-blank key is kept as stored (the launch tries the trimmed variant).
 */
function secretKey(name: string): string {
  const raw = required(name)
  if (raw.trim().length === 0) {
    throw new Error(`[env] Invalid value for ${name} (must not be blank)`)
  }
  return raw
}

// --- Resolve + validate at module load ---------------------------------------

/** LPL decryption key + exchange-signature secret for the demo environment (secret). */
export const ONEHEALTH_SECRET_KEY_DEMO: string = secretKey("ONEHEALTH_SECRET_KEY_DEMO")

/** LPL decryption key + exchange-signature secret for the prod environment (secret). */
export const ONEHEALTH_SECRET_KEY_PROD: string = secretKey("ONEHEALTH_SECRET_KEY_PROD")

// Equal keys would detect every payload as prod (PROD is tried first, D2).
if (ONEHEALTH_SECRET_KEY_DEMO.trim() === ONEHEALTH_SECRET_KEY_PROD.trim()) {
  throw new Error(
    `[env] Invalid value for ONEHEALTH_SECRET_KEY_DEMO / ONEHEALTH_SECRET_KEY_PROD (the two keys must differ)`,
  )
}

/** The demo External Application id (`required.apiKey.name` must equal it). */
export const APP_ID_DEMO: string = required("APP_ID_DEMO")

/** The prod External Application id (`required.apiKey.name` must equal it). */
export const APP_ID_PROD: string = required("APP_ID_PROD")

/** iron-session sealing key (secret, ≥ 32 chars). */
export const SESSION_SECRET: string = resolveSessionSecret()

/** Previous sealing key accepted for unsealing during a rotation overlap (optional, AD-20). */
export const SESSION_SECRET_PREVIOUS: string | undefined = optional("SESSION_SECRET_PREVIOUS")

/** Whether Google Places address suggestions are enabled (AD-14). */
export const PLACES_ENABLED: boolean = bool(optional("PLACES_ENABLED"))

/** Google Places (New) server key (secret); required only when `PLACES_ENABLED` (AD-14). */
export const GOOGLE_PLACES_KEY: string | undefined = resolveGooglePlacesKey(PLACES_ENABLED)

/** Incident kill switch: launch, the proxy and the session routes answer 503 SERVICE_DISABLED (AD-20). */
export const PP_DISABLED: boolean = bool(optional("PP_DISABLED"))

/** Profile-module kill switch: proxy entries tagged `profile: true` answer 503 (D12, Story 1.3). */
export const ACCOUNT_DISABLED: boolean = bool(optional("ACCOUNT_DISABLED"))

/** `true` only under local `next dev` (`NODE_ENV === "development"`). */
export const IS_LOCAL_DEV: boolean = process.env.NODE_ENV === "development"

/** The required patient tenant (AD-6). */
export const DEFAULT_TENANT_ID = 1 as const

const SECRET_KEYS: Readonly<Record<Environment, string>> = {
  demo: ONEHEALTH_SECRET_KEY_DEMO,
  prod: ONEHEALTH_SECRET_KEY_PROD,
}

const APP_IDS: Readonly<Record<Environment, string>> = {
  demo: APP_ID_DEMO,
  prod: APP_ID_PROD,
}

/**
 * The env var NAME holding each environment's secret key, for warnings that
 * must name the variable without its value (Story 1.2). Names live here so no
 * other module spells a `_DEMO`/`_PROD` name (forbidden-pattern gate, D1).
 */
const SECRET_KEY_VAR_NAMES: Readonly<Record<Environment, string>> = {
  demo: "ONEHEALTH_SECRET_KEY_DEMO",
  prod: "ONEHEALTH_SECRET_KEY_PROD",
}

/** The secret key of `env`, exactly as stored (never trimmed). */
export function getSecretKey(env: Environment): string {
  return SECRET_KEYS[env]
}

/** The External Application id of `env`. */
export function getAppId(env: Environment): string {
  return APP_IDS[env]
}

/** The NAME (never the value) of the variable holding `env`'s secret key. */
export function getSecretKeyVarName(env: Environment): string {
  return SECRET_KEY_VAR_NAMES[env]
}
