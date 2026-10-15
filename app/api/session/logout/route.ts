import { guardRoute } from "@/lib/server/http/guard-route"
import { methodNotAllowed } from "@/lib/server/http/responses"
import { createLogoutHandler } from "@/lib/server/session/session-routes"

export const dynamic = "force-dynamic"

const handler = guardRoute("/api/session/logout", createLogoutHandler())

/** GET behaves exactly like POST (D5, A11-1, as patient-vault). */
export const POST = handler
export const GET = handler

/**
 * Explicit 405s. Without them Next would answer HEAD with the GET handler
 * (running a full logout and platform revoke) and OPTIONS with a 204.
 */
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
