import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

/** One MSW server for every test: handlers are added per test with `server.use()`. */
export const server = setupServer()

/**
 * Counts every request that reaches the network layer (each answered with a
 * network error). Use it to prove a code path makes no upstream call: an
 * unhandled request also errors, but code that maps errors could hide it.
 */
export function trackAllRequests(): () => number {
  let count = 0
  server.use(
    http.all("*", () => {
      count += 1
      return HttpResponse.error()
    }),
  )
  return () => count
}
