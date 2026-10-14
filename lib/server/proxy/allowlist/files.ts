import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * File downloads (AD-13): image entries only. `preview=true` is forced
 * server-side and no client query is accepted (`fromSKid` is never needed
 * here), so `?x=1` is 400 `BAD_QUERY`. The id is the numeric `{fileId}`.
 */
export const entries: readonly AllowlistEntry[] = [{ method: "GET", template: "v2/file/{fileId}/download", asImage: true }]
