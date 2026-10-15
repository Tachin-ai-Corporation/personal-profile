/**
 * Authenticator app (Team B, Epic 8: Stories 8.1–8.3). Pre-created by spec
 * F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own (`profile: true` entries land with their
 * stories in `lib/server/proxy/allowlist/mfa.ts`):
 * - `POST v2/mfa/enable/totp` (QR code, 8.2);
 * - `POST /api/pp/mfa/validate` `{ code }` (named op, built in F2);
 * - `POST v2/mfa/disable/totp` (8.3).
 * Status comes from `myself.mfaEnabled` / `totpEnabled`.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { proxyPath } from "./config"

export function mfaEnableTotpPath(): string {
  return proxyPath("v2/mfa/enable/totp")
}

export function mfaDisableTotpPath(): string {
  return proxyPath("v2/mfa/disable/totp")
}

export function mfaValidatePath(): string {
  return BFF_PATHS.mfaValidate
}
