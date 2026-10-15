import "server-only"

import { z } from "zod"

/** AD-2/AD-16: an access token this close to expiry counts as expired. */
export const EXPIRY_SKEW_MS = 30_000

/** Lifetime used when the IdP's `expires_in` is missing or unusable. */
export const FALLBACK_EXPIRES_IN_S = 300

/** The longest lifetime believed (one day); anything longer is unusable. */
export const MAX_EXPIRES_IN_S = 86_400

const DECIMAL = /^\d+(\.\d+)?$/

/**
 * An OAuth `expires_in` (launch exchange and refresh grant, spec R5-1): a
 * finite number or a plain decimal string in (skew, 1 day] seconds; anything
 * else (missing, 0, negative, ≤ the 30 s skew, over a day, `"0x10"`, `"1e13"`,
 * non-numeric) → the 300 s fallback. Never fails, so the tokens are never dropped.
 */
export function parseExpiresIn(value: unknown): number {
  const seconds = typeof value === "number" ? value : typeof value === "string" && DECIMAL.test(value.trim()) ? Number(value) : Number.NaN
  return Number.isFinite(seconds) && seconds > EXPIRY_SKEW_MS / 1000 && seconds <= MAX_EXPIRES_IN_S ? seconds : FALLBACK_EXPIRES_IN_S
}

/** `parseExpiresIn` as a schema field (optional: a missing value is the fallback). */
export const expiresInSchema = z.unknown().optional().transform(parseExpiresIn)
