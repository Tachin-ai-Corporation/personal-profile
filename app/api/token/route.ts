import { guardRoute } from "@/lib/server/http/guard-route"
import { createTokenHandler, tokenMethodNotAllowed } from "@/lib/server/launch/token-handler"

export const dynamic = "force-dynamic"

export const POST = guardRoute("/api/token", createTokenHandler())

/** Explicit 405s in the launch envelope, so Next never auto-implements them. */
export const GET = tokenMethodNotAllowed
export const HEAD = tokenMethodNotAllowed
export const OPTIONS = tokenMethodNotAllowed
export const PUT = tokenMethodNotAllowed
export const PATCH = tokenMethodNotAllowed
export const DELETE = tokenMethodNotAllowed
