import "server-only"

import { randomBytes } from "node:crypto"
import { sealData, unsealData } from "iron-session"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { serverEnv } from "@/lib/server/env"
import { sessionPayloadSchema, type SessionPayload } from "./types"

/** AD-1: one sealed, host-only cookie. */
export const SESSION_COOKIE = "__Host-pp_s"

/**
 * Per-seal TTL: a seal expires 8 h after it was written. A refresh re-seals, so
 * this slides; the absolute 8 h cap and idle logoff are enforced in Story 1.6.
 */
const SEAL_TTL_SECONDS = 8 * 60 * 60

/** AD-1 size budget for the serialized `Set-Cookie`. */
export const MAX_SET_COOKIE_BYTES = 3800

const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax"

export interface SessionSecrets {
  readonly current: string
  readonly previous?: string | undefined
}

function secretsFromEnv(): SessionSecrets {
  const env = serverEnv()
  return { current: env.SESSION_SECRET, previous: env.SESSION_SECRET_PREVIOUS }
}

/** A new random session id (128 bits). */
export function newSid(): string {
  return randomBytes(16).toString("base64url")
}

/** Seals with the current secret only (AD-20 rotation). */
export async function sealSession(payload: SessionPayload, secrets: SessionSecrets = secretsFromEnv()): Promise<string> {
  return sealData(payload, { password: secrets.current, ttl: SEAL_TTL_SECONDS })
}

async function unsealWith(seal: string, password: string): Promise<SessionPayload | null> {
  const data = await unsealData<unknown>(seal, { password, ttl: SEAL_TTL_SECONDS })
  const parsed = sessionPayloadSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/**
 * Unseals with the current secret, then the previous one while it is set.
 * Anything that fails to unseal or validate is "no session".
 */
export async function unsealSession(
  seal: string | undefined,
  secrets: SessionSecrets = secretsFromEnv(),
): Promise<SessionPayload | null> {
  if (!seal) return null
  const current = await unsealWith(seal, secrets.current)
  if (current) return current
  return secrets.previous ? unsealWith(seal, secrets.previous) : null
}

/** `Set-Cookie` for a sealed session: session cookie (no Max-Age/Expires), no Domain, no partition attribute (D10). */
export function sessionSetCookie(seal: string): string {
  return `${SESSION_COOKIE}=${seal}; ${COOKIE_ATTRIBUTES}`
}

/** `Set-Cookie` that clears the session (same attributes, `Max-Age=0`). */
export function clearSessionSetCookie(): string {
  return `${SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`
}

/** Seals and serializes; throws if the cookie would exceed the AD-1 budget. */
export async function buildSessionSetCookie(payload: SessionPayload, secrets?: SessionSecrets): Promise<string> {
  const header = sessionSetCookie(await sealSession(payload, secrets))
  if (Buffer.byteLength(header, "utf8") > MAX_SET_COOKIE_BYTES) {
    throw new Error("Session cookie exceeds the 3800-byte budget")
  }
  return header
}

/** Reads one cookie value from a raw `Cookie` header. */
export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

/** Route handlers: the current session, or `null` (the caller answers 401). */
export async function getSession(request: Request): Promise<SessionPayload | null> {
  return unsealSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE))
}

/** Pages: the current session, or a redirect to `/auth` (template entry behavior). */
export async function requireSession(): Promise<SessionPayload> {
  const store = await cookies()
  const session = await unsealSession(store.get(SESSION_COOKIE)?.value)
  if (!session) redirect("/auth")
  return session
}
