import { createHandoffHandler } from "@/lib/server/handoff"
import { guardRoute } from "@/lib/server/http/guard-route"
import { BFF_PATHS } from "@/lib/shared/bff-contract"

export const dynamic = "force-dynamic"

const handler = guardRoute(BFF_PATHS.handoffPortal, createHandoffHandler())

export const GET = handler
/** Explicit methods prevent Next from implementing HEAD/OPTIONS through GET. */
export const HEAD = handler
export const OPTIONS = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
