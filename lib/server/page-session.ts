import "server-only"

import { cookies } from "next/headers"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { ENVIRONMENT_COOKIE, parseEnvironmentCookie } from "@/lib/server/session/environment-cookie"
import { requireSession } from "@/lib/server/session/session"

export interface PageSessionContext {
  /** The session environment's portal URL (D4), registered with `lib/api/client.ts` on the client. */
  readonly portalUrl: string
}

/**
 * The one helper every page server component uses (Story 1.4): requires a
 * session (else redirect to `/auth`) and returns what the page embeds for the
 * client. No token, id or session binding leaves the server (D5).
 */
export async function requirePageSession(): Promise<PageSessionContext> {
  const session = await requireSession()
  return { portalUrl: environmentConfig(session.environment).portalUrl }
}

/** `/auth` wrapper: the remembered environment, display only (D2). */
export async function rememberedEnvironment(): Promise<Environment | null> {
  const store = await cookies()
  return parseEnvironmentCookie(store.get(ENVIRONMENT_COOKIE)?.value)
}
