import { guardRoute } from "@/lib/server/http/guard-route"
import { methodNotAllowed } from "@/lib/server/http/responses"
import { createRefreshHandler } from "@/lib/server/session/session-routes"

export const dynamic = "force-dynamic"

export const POST = guardRoute("/api/session/refresh", createRefreshHandler())

/** Explicit 405s, so Next never auto-implements them. */
export const GET = methodNotAllowed
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
export const PUT = methodNotAllowed
export const PATCH = methodNotAllowed
export const DELETE = methodNotAllowed
