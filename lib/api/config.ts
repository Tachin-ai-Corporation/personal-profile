/**
 * Same-origin paths of 1health endpoints, through the BFF proxy. Each one must
 * have an allowlist entry in `lib/server/proxy/allowlist.ts`. Owner ids are
 * the literal `me` (the proxy fills them from the session).
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import type { ContactPointType } from "./contact-points"

const proxy = (path: string): string => `${BFF_PATHS.proxyPrefix}${path}`

export const endpoints = {
  myself: (): string => proxy("v2/user/myself"),
  /** One Contact Type per request (AD-10). */
  contactPoints: (type: ContactPointType): string => proxy(`v2/user/contact-point/list?type=${encodeURIComponent(type)}`),
} as const
