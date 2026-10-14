/**
 * =============================================================================
 * The 1health environment map (D1, D2, D4, D7)
 * =============================================================================
 *
 * One deployment serves both 1health environments. The environment of a session
 * is decided once, at launch, by whichever secret key decrypts the launch payload
 * (`/api/token`), and is sealed in the session cookie. Every upstream origin is
 * derived from that sealed value through this map; it never comes from an env
 * var, a request, a URL, the referrer or a cookie.
 *
 * This is the ONLY module that knows a 1health origin. It holds no secrets and
 * is importable by both server and client code.
 * =============================================================================
 */

/** The two 1health environments. There is no `dev`. */
export type Environment = "demo" | "prod"

/** The per-environment origins. */
export interface EnvironmentConfig {
  /** The 1health root origin (API, auth server and portal share it). */
  apiRoot: string
  /** The upstream API base: `<apiRoot>/api`. */
  apiBase: string
  /** The portal "Return to 1health" and hand-off target: the same root. */
  portalUrl: string
  /**
   * The origin of organization `tenantLogo.publicUrl` values (AD-24, D7).
   * Values are still open; unset means org logos 404.
   */
  publicFilesOrigin: string | undefined
}

function config(apiRoot: string): EnvironmentConfig {
  return { apiRoot, apiBase: `${apiRoot}/api`, portalUrl: apiRoot, publicFilesOrigin: undefined }
}

/** The constant environment map (D4). */
export const environments: Readonly<Record<Environment, Readonly<EnvironmentConfig>>> = {
  demo: config("https://1health.demo.1health.io"),
  prod: config("https://1health.app.1health.io"),
}

/** The environments, in detection order (prod first, D2). */
export const ENVIRONMENTS: readonly Environment[] = ["prod", "demo"]

/** Type guard: `true` only for `"demo"` or `"prod"`. */
export function isEnvironment(value: unknown): value is Environment {
  return value === "demo" || value === "prod"
}
