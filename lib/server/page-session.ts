import "server-only"

import { cookies } from "next/headers"
import type { PageIdleTiming } from "@/lib/shared/bff-contract"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { ENVIRONMENT_COOKIE, parseEnvironmentCookie } from "@/lib/server/session/environment-cookie"
import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, requireSession } from "@/lib/server/session/session"

export interface PageSessionContext {
  /** The session environment's portal URL (D4), registered with `lib/api/client.ts` on the client. */
  readonly portalUrl: string
  /** The idle warning's deadlines (Story 1.6): four numbers, nothing else. */
  readonly idle: PageIdleTiming
}

/**
 * The one helper every page server component uses (Story 1.4): requires a
 * session (else redirect to `/auth`) and returns what the page embeds for the
 * client. No token, id or session binding leaves the server (D5).
 */
export async function requirePageSession(now: number = Date.now()): Promise<PageSessionContext> {
  const session = await requireSession(now)
  return {
    portalUrl: environmentConfig(session.environment).portalUrl,
    idle: {
      idleTimeoutSec: IDLE_TIMEOUT_MS / 1000,
      lastSeen: session.lastSeen,
      absoluteExpiresAt: session.iat + ABSOLUTE_TIMEOUT_MS,
      serverNow: now,
    },
  }
}

/** `/auth` wrapper: the remembered environment, display only (D2). */
export async function rememberedEnvironment(): Promise<Environment | null> {
  const store = await cookies()
  return parseEnvironmentCookie(store.get(ENVIRONMENT_COOKIE)?.value)
}
