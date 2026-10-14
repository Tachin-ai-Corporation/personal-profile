import "server-only"

import { cookies } from "next/headers"
import { isEnvironment, type Environment } from "@/lib/shared/environments"

/**
 * =============================================================================
 * The remembered environment — `onehealth_environment` (D4)
 * =============================================================================
 *
 * A non-secret cookie `/api/token` sets on a successful launch, so session-less
 * screens (`/auth`, the kill-switch screen, later the post-expiry Return to
 * 1health) can show the right labels and portal link. It is DISPLAY ONLY: no
 * API call ever takes its environment from this cookie — upstream calls use the
 * session's sealed `environment` (D2).
 *
 * `HttpOnly`, so the client never reads it (`/auth` gets it from the server
 * wrapper); 30 days; left unchanged by a failed launch.
 * =============================================================================
 */

export const ENVIRONMENT_COOKIE_NAME = "onehealth_environment"

/** 30 days, in seconds. */
const MAX_AGE_S = 2_592_000

/** The `Set-Cookie` string remembering `env`. */
export function environmentCookie(env: Environment): string {
  return `${ENVIRONMENT_COOKIE_NAME}=${env}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`
}

/** The remembered environment of the current request, or `null` when absent or not `demo|prod`. */
export async function readEnvironmentCookie(): Promise<Environment | null> {
  const value = (await cookies()).get(ENVIRONMENT_COOKIE_NAME)?.value
  return isEnvironment(value) ? value : null
}
