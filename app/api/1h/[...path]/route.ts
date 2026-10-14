import "server-only"

import { createProxy } from "@/lib/server/proxy"
import { ALLOWLIST } from "@/lib/server/proxy-allowlist"

/**
 * The 1health BFF proxy route (AD-2). Browser calls `/api/1h/<path>` reach here;
 * everything is handled by the injectable `createProxy` pipeline over the shipped
 * `ALLOWLIST`. Rendered per request so no PHI is ever cached (AD-18).
 *
 * `HEAD`/`OPTIONS`/`TRACE` are exported explicitly so Next does not auto-implement
 * them — each answers 405.
 */
export const dynamic = "force-dynamic"

const handlers = createProxy(ALLOWLIST)

export const GET = handlers.GET
export const POST = handlers.POST
export const PUT = handlers.PUT
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
export const HEAD = handlers.HEAD
export const OPTIONS = handlers.OPTIONS
export const TRACE = handlers.TRACE
