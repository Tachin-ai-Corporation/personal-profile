import { sealData } from "iron-session"
import { TEST_SERVER_ENV } from "./server-env"

/** Seals a session the way the server does, for pages that need one (the real exchange is unit-tested). */
export async function sealedSessionCookie(): Promise<{ name: string; value: string }> {
  const now = Date.now()
  const value = await sealData(
    {
      accessToken: "e2e-access",
      refreshToken: "e2e-refresh",
      accessExpiresAt: now + 3_600_000,
      userId: 42,
      personId: 4242,
      tenantId: 1,
      sid: "ZTJlLXNlc3Npb24taWQtMTIzNA",
      gen: 0,
      iat: now,
      lastSeen: now,
      environment: "demo",
    },
    { password: TEST_SERVER_ENV.SESSION_SECRET, ttl: 8 * 60 * 60 },
  )
  return { name: "__Host-pp_s", value }
}
