import { http, HttpResponse, type HttpHandler } from "msw"
import { shellReadHandlers, type PageReadOptions } from "./shell"

/**
 * Team B owns this file (spec F7-1): every planned read of `/account`
 * answered with an empty, valid default (the e2e twin is
 * `e2e/fixtures/defaults-account.ts`). A Team B story that adds a read on
 * `/account` adds its default here in the same change.
 */

/**
 * `/account`: the shell reads + the user's NPI (404: not registered), practice
 * support (404 `NO_PRACTICE`) and the organizations page (empty). The NPI and
 * organizations shapes are placeholders until Stories 9.1 and 10.1 confirm them
 * (same as `e2e/fixtures/{npi,orgs}.ts`).
 */
export function accountReadHandlers(options: PageReadOptions = {}): HttpHandler[] {
  return [
    ...shellReadHandlers(options),
    http.get("/api/1h/v2/user/npi", () => HttpResponse.json({ message: "Not found", code: 404 }, { status: 404 })),
    http.get("/api/pp/practice-support", () => HttpResponse.json({ errorCode: "NO_PRACTICE", source: "proxy" }, { status: 404 })),
    http.get("/api/1h/v2/user/organization/portal", () => HttpResponse.json({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 12 })),
  ]
}
