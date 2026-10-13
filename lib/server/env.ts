import "server-only"

/**
 * =============================================================================
 * Server environment — the single reader of server `process.env`
 * =============================================================================
 *
 * This module (and only this module) reads server-side `process.env`. The one
 * client-side exception is `process.env.NEXT_PUBLIC_APP_ENV`, read only in
 * `lib/shared/app-env.ts`. ESLint enforces this (see `eslint.config.mjs`).
 *
 * Validation runs at module load. `instrumentation.ts` imports this module from
 * `register()` so a missing or invalid required variable fails the boot. Boot
 * errors name the offending variable but NEVER print its value (AD-3, AD-20).
 *
 * Origins are fixed per `APP_ENV` (AD-3): they never come from an env var and
 * are never stored in the session cookie.
 * =============================================================================
 */

/** The three deployment environments; each deployment is pinned to exactly one (AD-3). */
export type AppEnv = "dev" | "demo" | "prod"

/** API/portal origin fixed per environment — never read from an env var (AD-3). */
const ORIGIN_BY_ENV: Record<AppEnv, string> = {
  dev: "https://dev.1hdev.io",
  demo: "https://demo.1health.io",
  prod: "https://app.1health.io",
}

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

function resolveAppEnv(): AppEnv {
  const raw = required("APP_ENV")
  if (raw !== "dev" && raw !== "demo" && raw !== "prod") {
    throw new Error(`[env] Invalid value for APP_ENV (expected one of: dev, demo, prod)`)
  }
  return raw
}

function resolveAppOrigin(): string {
  const raw = required("APP_ORIGIN")
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`[env] Invalid value for APP_ORIGIN (must be an https:// origin with no path)`)
  }
  // Must be https, origin-only (no path, query, or fragment).
  const isOriginOnly = url.protocol === "https:" && (url.pathname === "" || url.pathname === "/") && !url.search && !url.hash
  if (!isOriginOnly) {
    throw new Error(`[env] Invalid value for APP_ORIGIN (must be an https:// origin with no path)`)
  }
  // Normalize away any trailing slash.
  return url.origin
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

// --- Resolve + validate at module load ---------------------------------------

export const APP_ENV: AppEnv = resolveAppEnv()

/** Upstream 1health API origin, fixed by `APP_ENV` (AD-3). */
export const API_ORIGIN: string = ORIGIN_BY_ENV[APP_ENV]

/** This deployment's own public origin (used for CSRF/origin checks, AD-17). */
export const APP_ORIGIN: string = resolveAppOrigin()

/** The 1health portal origin, fixed by `APP_ENV`; the only allowed `frame-ancestors` (AD-5, AD-21). */
export const PORTAL_ORIGIN: string = ORIGIN_BY_ENV[APP_ENV]

/** The portal's applications listing — the constant "Return to 1health" target (AD-5). */
export const PORTAL_URL: string = `${PORTAL_ORIGIN}/applications`

/** This deployment's External Application id (secret-ish; never exposed to the client). */
export const APP_ID: string = required("APP_ID")

/** The required patient tenant (AD-6). */
export const DEFAULT_TENANT_ID = 1 as const

/** LPL decryption key for this environment (secret). */
export const ONEHEALTH_SECRET_KEY: string = required("ONEHEALTH_SECRET_KEY")

/** iron-session sealing key (secret, ≥ 32 chars). */
export const SESSION_SECRET: string = resolveSessionSecret()

/** Previous sealing key accepted during rotation overlap (optional, AD-20). */
export const SESSION_SECRET_PREVIOUS: string | undefined = optional("SESSION_SECRET_PREVIOUS")

/** Whether Google Places address suggestions are enabled for this deployment (AD-14). */
export const PLACES_ENABLED: boolean = bool(optional("PLACES_ENABLED"))

/** Google Places (New) server key (secret); required only when `PLACES_ENABLED` (AD-14). */
export const GOOGLE_PLACES_KEY: string | undefined = resolveGooglePlacesKey(PLACES_ENABLED)

/** Incident kill switch: when set, launch and the proxy return 503 SERVICE_DISABLED (AD-20). */
export const PP_DISABLED: boolean = bool(optional("PP_DISABLED"))
