import "server-only"

import { z } from "zod"
import { ENVIRONMENTS } from "@/lib/shared/environments"

/**
 * Everything the sealed `__Host-pp_s` cookie holds (AD-1). Times are epoch ms.
 * `environment` decides the upstream origin per request (spec 7.0a decision).
 * `id_token` and the API origin are never stored.
 */
export const sessionPayloadSchema = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** When the access token expires (epoch ms). */
  accessExpiresAt: z.number().int().nonnegative(),
  userId: z.number().int().positive(),
  personId: z.number().int().positive(),
  tenantId: z.number().int().positive(),
  /** Random per launch (≥ 128 bits, base64url). Kept across refreshes. */
  sid: z.string().min(22),
  /** Incremented on every refresh. */
  gen: z.number().int().nonnegative(),
  /** Launch time (epoch ms). */
  iat: z.number().int().nonnegative(),
  /** Last user-initiated request (epoch ms). */
  lastSeen: z.number().int().nonnegative(),
  environment: z.enum(ENVIRONMENTS),
})

export type SessionPayload = z.infer<typeof sessionPayloadSchema>
