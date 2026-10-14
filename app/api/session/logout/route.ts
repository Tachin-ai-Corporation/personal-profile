import "server-only"

import { handleLogout } from "@/lib/server/logout"

/**
 * Logout (AD-16, Story 1.7). All logic lives in `lib/server/logout.ts`;
 * rendered per request so nothing is cached (AD-18).
 */
export const dynamic = "force-dynamic"

export const POST = (request: Request): Promise<Response> => handleLogout(request)
