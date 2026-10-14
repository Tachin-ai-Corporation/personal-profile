import { createDisabledScreenHandler } from "@/lib/server/disabled-screen"
import { guardRoute } from "@/lib/server/http/guard-route"

export const dynamic = "force-dynamic"

/**
 * The kill-switch screen (Stories 1.16, 7.2). `proxy.ts` rewrites every
 * switched-off page here; this route answers 503 (a page would render 200).
 * Every method gets the same answer (a disabled page's form posts included).
 */
const handler = guardRoute("/disabled", createDisabledScreenHandler())

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler
