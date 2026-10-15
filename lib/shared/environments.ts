/**
 * The 1health environments (D1, D4) and the constant URLs of each. Pure and
 * isomorphic, no secrets. The server picks the upstream root per request from
 * the session's `environment`; `/auth` uses it for display labels and links.
 *
 * This is the only module that names a 1health origin. Origins never come from
 * env vars, request input or response data.
 */

/**
 * Every environment the app knows, in display order. `demo` and `prod` are
 * always configured; `dev` (D18) only when its credential pair is set, so the
 * server decides which of these a deployment offers (`lib/server/env.ts`
 * `configuredEnvironments`).
 */
export const ENVIRONMENTS = ["demo", "prod", "dev"] as const

export type Environment = (typeof ENVIRONMENTS)[number]

export interface EnvironmentConfig {
  /** Platform root: IdP (`<apiRoot>/auth/...`) and portal. */
  readonly apiRoot: string
  /** REST API base: `<apiRoot>/api`. */
  readonly apiBase: string
  /** Where "Return to 1health" and hand-offs go (the same root, D4). */
  readonly portalUrl: string
  /**
   * Origin of organization `tenantLogo.publicUrl` (AD-24, D7). `null` = unknown,
   * and every logo of that environment 404s (cards show initials).
   */
  readonly publicFilesOrigin: string | null
  /** Hostname fragment that recognises this environment in `document.referrer` (display only, D2). */
  readonly referrerHostFragment: string
  /** Human label shown on `/auth`. */
  readonly label: string
}

function config(apiRoot: string, publicFilesOrigin: string | null, referrerHostFragment: string, label: string): EnvironmentConfig {
  return { apiRoot, apiBase: `${apiRoot}/api`, portalUrl: apiRoot, publicFilesOrigin, referrerHostFragment, label }
}

/*
 * TODO(Story 10.2): the `publicFilesOrigin` values are unconfirmed (found only
 * in 2022–2023 backend history). Confirm each against a live
 * `tenantLogo.publicUrl` on demo and prod before Story 10.2; tracked in
 * `_bmad-output/implementation-artifacts/deferred-work.md` ("Confirm
 * publicFilesOrigin", source spec F2). A mismatch only falls back to initials.
 * Dev (D18) has none confirmed, so `null`: every dev org logo 404s (initials).
 */
const CONFIG: Readonly<Record<Environment, EnvironmentConfig>> = {
  demo: config("https://1health.demo.1health.io", "https://bocore-public-files-demo.s3.us-west-1.amazonaws.com", "demo.1health", "Demo"),
  prod: config("https://1health.app.1health.io", "https://bocore-public-files-prod.s3.us-west-1.amazonaws.com", "app.1health", "Production"),
  dev: config("https://dev.1hdev.io", null, "dev.1hdev.io", "Dev"),
}

export function isEnvironment(value: unknown): value is Environment {
  return (ENVIRONMENTS as readonly unknown[]).includes(value)
}

export function environmentConfig(environment: Environment): EnvironmentConfig {
  return CONFIG[environment]
}

/** The environment whose portal URL this is (the page's `PortalUrlProvider` value), else `null`. */
export function environmentOfPortalUrl(portalUrl: string): Environment | null {
  return ENVIRONMENTS.find((environment) => CONFIG[environment].portalUrl === portalUrl) ?? null
}

/**
 * Display-only environment guess from the page that opened `/auth` (never sent
 * with a request). Only `configured` environments are recognised (D18: a dev
 * referrer means nothing while dev is off).
 */
export function environmentFromReferrer(referrer: string, configured: readonly Environment[] = ENVIRONMENTS): Environment | null {
  let hostname: string
  try {
    hostname = new URL(referrer).hostname
  } catch {
    return null
  }
  for (const environment of configured) {
    if (hostname.includes(CONFIG[environment].referrerHostFragment)) return environment
  }
  return null
}
