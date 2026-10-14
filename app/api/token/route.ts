import "server-only"

import { handleToken, tokenMethodNotAllowed } from "@/lib/server/token"

/**
 * The launch exchange, `POST /api/token` (Story 1.2, D1, D2, D9). All logic
 * lives in `lib/server/token.ts`; rendered per request so nothing is cached
 * (AD-18). Every other method answers 405, exported explicitly so Next does not
 * auto-implement `HEAD`/`OPTIONS`.
 */
export const dynamic = "force-dynamic"

export const POST = (request: Request): Promise<Response> => handleToken(request)

export const GET = tokenMethodNotAllowed
export const PUT = tokenMethodNotAllowed
export const PATCH = tokenMethodNotAllowed
export const DELETE = tokenMethodNotAllowed
export const HEAD = tokenMethodNotAllowed
export const OPTIONS = tokenMethodNotAllowed
