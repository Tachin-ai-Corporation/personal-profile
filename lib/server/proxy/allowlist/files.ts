import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * File entries (AD-13). The id is the numeric `{fileId}` (one id: the
 * upstream route also takes a comma list, which `^\d{1,19}$` refuses).
 *
 * - Download: an image entry. `preview=true` is forced server-side and no
 *   client query is accepted (`fromSKid` is never needed here), so `?x=1` is
 *   400 `BAD_QUERY`.
 * - Delete (spec F7-2, for Stories 1.10 picture replace, 2.4 signature
 *   remove, 5.3 card replace): `DELETE v2/file/{fileInstanceIds}` (agents.md;
 *   1health-fe sends `?hardDelete=true`). `hardDelete=true` is forced, a
 *   client `hardDelete` is ignored, any other query is 400; no body. The
 *   backend checks no ownership: callers take ids only from the app's own
 *   data (`profile-picture-id`, `myself.signature`, saved policies).
 */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/file/{fileId}/download", asImage: true },
  { method: "DELETE", template: "v2/file/{fileId}", fixedQuery: { hardDelete: "true" } },
]
