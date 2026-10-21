import { http, HttpResponse, type HttpHandler } from "msw"
import { shellReadHandlers, type PageReadOptions } from "./shell"

/**
 * Team B owns this file (spec F7-1): every planned read of `/account`
 * answered with an empty, valid default (the e2e twin is
 * `e2e/fixtures/defaults-account.ts`). A Team B story that adds a read on
 * `/account` adds its default here in the same change.
 */

/**
 * `/account`: the shell reads + the user's NPI (200: not registered), practice
 * support (404 `NO_PRACTICE`) and the organizations page (empty). The NPI and
 * organization list uses the platform's custom PageImpl data envelope
 * (same as `e2e/fixtures/orgs.ts`).
 */
export function accountReadHandlers(options: PageReadOptions = {}): HttpHandler[] {
  return [
    ...shellReadHandlers(options),
    http.get("/api/1h/v2/user/npi", () => HttpResponse.json({ providerNpi: null, practiceNpi: null, hieEndpoint: null })),
    http.get("/api/1h/v2/public/npi/list", () => HttpResponse.json({ data: [], totalElements: 0 })),
    http.get("/api/pp/practice-support", () => HttpResponse.json({ errorCode: "NO_PRACTICE", source: "proxy" }, { status: 404 })),
    http.get("/api/1h/v2/user/organization/portal", () => HttpResponse.json({ data: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 12, offset: 0, emptyPage: true, firstPage: true, lastPage: true, numberOfElements: 0 })),
  ]
}
