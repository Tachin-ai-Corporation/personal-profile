/**
 * Same-origin paths of 1health endpoints go through the BFF proxy. Each
 * `lib/api/<resource>.ts` owns its own paths, built with `proxyPath()`, and
 * each needs an entry in its area file under `lib/server/proxy/allowlist/`.
 * Owner ids are the literal `me` (the proxy fills them from the session).
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"

export function proxyPath(path: string): string {
  return `${BFF_PATHS.proxyPrefix}${path}`
}
