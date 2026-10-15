import "server-only"

import { ENVIRONMENTS, isEnvironment, type Environment } from "@/lib/shared/environments"

/**
 * The remembered environment (D4): non-secret `onehealth_environment`, set by a
 * successful launch. Session-less code resolves the environment from the
 * session, else this cookie, else `prod`; never from a URL parameter.
 */
export const ENVIRONMENT_COOKIE = "onehealth_environment"

const THIRTY_DAYS_SECONDS = 2_592_000

export function environmentSetCookie(environment: Environment): string {
  return `${ENVIRONMENT_COOKIE}=${environment}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}`
}

/**
 * The cookie value when it names a known environment this deployment has
 * configured (`configured`, default every one), else `null`: a remembered
 * `dev` is ignored while dev is off (D18).
 */
export function parseEnvironmentCookie(value: string | undefined, configured: readonly Environment[] = ENVIRONMENTS): Environment | null {
  return isEnvironment(value) && configured.includes(value) ? value : null
}

export function resolveEnvironment(sessionEnvironment: Environment | null, cookieValue: string | undefined): Environment {
  return sessionEnvironment ?? parseEnvironmentCookie(cookieValue) ?? "prod"
}
