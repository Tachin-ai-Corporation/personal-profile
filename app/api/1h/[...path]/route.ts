import { guardRoute } from "@/lib/server/http/guard-route"
import { methodNotAllowed } from "@/lib/server/http/responses"
import { createProxyHandler } from "@/lib/server/proxy/handler"

export const dynamic = "force-dynamic"

const ROUTE = "/api/1h/[...path]"
const handler = guardRoute(ROUTE, createProxyHandler())

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler

/** Explicit, so Next never auto-implements them (AD-2). */
export const HEAD = methodNotAllowed
export const OPTIONS = methodNotAllowed
