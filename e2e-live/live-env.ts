import { environmentConfig } from "../lib/shared/environments"

/**
 * Settings of the live suite (NG-9019 live e2e against 1health dev). The
 * runner config (`playwright.live.config.ts`, the one file here allowed to
 * read the environment) builds them from `.env.live.local` and hands them to
 * the tests as the `live` option; see `e2e-live/README.md`.
 */

/** The 1health dev environment: IdP, REST API and portal (`lib/shared/environments.ts`). */
export const DEV = environmentConfig("dev")

export interface LiveSettings {
  /** The dev test user (a patient-only, tenant-1 account; never an admin or support user). */
  readonly username: string
  readonly password: string
  /** Base32 TOTP secret, only when the test user has MFA on. */
  readonly totpSecret?: string
  /** PKCE redirect URI registered for `public-client` (the portal's `/authorized`). */
  readonly redirectUri: string
  /** External Application id on dev ("Personal Profile", 173). */
  readonly appId: string
  /** Switch a token on another tenant to the personal account (`LIVE_DEV_SWITCH_TENANT=1`). */
  readonly switchTenant: boolean
  /** Reversible writes (add then remove an address): `LIVE_ALLOW_WRITES=1`. */
  readonly allowWrites: boolean
  /**
   * Writes whose delete may only label the record "Deleted" (insurance): the
   * account can't be put back exactly, so they need `LIVE_ALLOW_SOFT_DELETE=1`.
   */
  readonly allowSoftDelete: boolean
  /**
   * "Return to 1health" revokes every session of the user (`logout/all-devices`),
   * a human signed in as the test user included: `LIVE_ALLOW_LOGOUT=1`.
   */
  readonly allowLogout: boolean
  /**
   * How the suite signs in. `token`: the runner signs the test user in
   * (`LIVE_DEV_USERNAME`/`LIVE_DEV_PASSWORD`) and asks the backend for a
   * launch payload per test; the user must be a plain patient account.
   * `portal`: `LIVE_PORTAL_LOGIN=1`, a person signs in to the dev portal in
   * a visible browser, the setup catches the launch the portal makes and every
   * test reuses that one app session (`e2e-live/global-setup.ts`).
   */
  readonly mode: "token" | "portal"
  /** Required settings that are not set (the tests fail early, naming them). */
  readonly missing: readonly string[]
}

/**
 * Where the portal mode keeps the app session (the sealed cookie) between
 * setup, tests and runs; gitignored. Outside `test-results/live`, which
 * Playwright empties at the start of every run.
 */
export const PORTAL_SESSION_FILE = "test-results/.live-portal-session.json"

/** Builds the settings from an environment map; a missing required value is named in `missing`. */
export function liveSettingsFrom(env: Readonly<Record<string, string | undefined>>): LiveSettings {
  const value = (name: string): string | undefined => (env[name] === undefined || env[name] === "" ? undefined : env[name])
  const mode = value("LIVE_PORTAL_LOGIN") === "1" ? "portal" : "token"
  const missing = mode === "portal" ? [] : ["LIVE_DEV_USERNAME", "LIVE_DEV_PASSWORD"].filter((name) => value(name) === undefined)
  return {
    username: value("LIVE_DEV_USERNAME") ?? "",
    password: value("LIVE_DEV_PASSWORD") ?? "",
    totpSecret: value("LIVE_DEV_TOTP_SECRET"),
    redirectUri: value("LIVE_DEV_REDIRECT_URI") ?? `${DEV.portalUrl}/authorized`,
    appId: value("LIVE_DEV_APP_ID") ?? "173",
    switchTenant: value("LIVE_DEV_SWITCH_TENANT") === "1",
    allowWrites: value("LIVE_ALLOW_WRITES") === "1",
    allowSoftDelete: value("LIVE_ALLOW_SOFT_DELETE") === "1",
    allowLogout: value("LIVE_ALLOW_LOGOUT") === "1",
    mode,
    missing,
  }
}
