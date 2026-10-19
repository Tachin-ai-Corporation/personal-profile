import "server-only"

import type { AllowlistEntry } from "../types"

/** Authenticator app (Epic 8, `profile: true`) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  { method: "POST", template: "v2/mfa/enable/totp", profile: true },
]
