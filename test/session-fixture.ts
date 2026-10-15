import type { SessionPayload } from "@/lib/server/session/types"

/** A ~1,224-byte RS256-shaped access token (the largest observed size, AD-1). */
export function fakeAccessToken(tenantId: number | string = 1, padTo = 1224): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const claims = Buffer.from(JSON.stringify({ tenantId, enc: "x".repeat(400) })).toString("base64url")
  const head = `${header}.${claims}.`
  return head + "s".repeat(Math.max(10, padTo - head.length))
}

export const NOW = 1_800_000_000_000

export function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    accessToken: fakeAccessToken(),
    refreshToken: "r".repeat(40),
    accessExpiresAt: NOW + 50 * 60 * 1000,
    userId: 42,
    personId: 4242,
    tenantId: 1,
    sid: "c2lkLWZvci10ZXN0cy0xMjM0NTY",
    gen: 0,
    iat: NOW,
    lastSeen: NOW,
    environment: "demo",
    ...overrides,
  }
}
