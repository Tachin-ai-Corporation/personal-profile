import "server-only"

import { logError, newRequestId } from "@/lib/server/log"
import { jsonError } from "./responses"

/**
 * Global error wrapper for route handlers (AD-15): an unhandled error answers
 * 500 `INTERNAL_ERROR` with no upstream data and logs only
 * `{ requestId, routeTemplate, status, errorName }`.
 */
export function guardRoute<A extends unknown[]>(
  routeTemplate: string,
  handler: (request: Request, ...rest: A) => Promise<Response>,
): (request: Request, ...rest: A) => Promise<Response> {
  return async (request, ...rest) => {
    try {
      return await handler(request, ...rest)
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError"
      logError({ requestId: newRequestId(), routeTemplate, status: 500, errorName })
      return jsonError(500, "INTERNAL_ERROR")
    }
  }
}
