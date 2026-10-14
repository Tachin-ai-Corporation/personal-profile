import "server-only"

import { handlePing } from "@/lib/server/ping"

/**
 * Activity ping (AD-16, Story 1.6). All logic lives in `lib/server/ping.ts`;
 * rendered per request so nothing is cached (AD-18).
 */
export const dynamic = "force-dynamic"

export const POST = (request: Request): Promise<Response> => handlePing(request)
