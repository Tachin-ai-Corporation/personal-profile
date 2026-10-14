import "server-only"

import { handleRefresh } from "@/lib/server/refresh"

/**
 * Client-coordinated token refresh (AD-16). All logic lives in
 * `lib/server/refresh.ts`; rendered per request so nothing is cached (AD-18).
 */
export const dynamic = "force-dynamic"

export const POST = (request: Request): Promise<Response> => handleRefresh(request)
