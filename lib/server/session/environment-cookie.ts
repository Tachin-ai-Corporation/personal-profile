import "server-only"

import { isEnvironment, type Environment } from "@/lib/shared/environments"

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

/** The cookie value when it names a known environment, else `null`. */
export function parseEnvironmentCookie(value: string | undefined): Environment | null {
  return isEnvironment(value) ? value : null
}

export function resolveEnvironment(sessionEnvironment: Environment | null, cookieValue: string | undefined): Environment {
  return sessionEnvironment ?? parseEnvironmentCookie(cookieValue) ?? "prod"
}
