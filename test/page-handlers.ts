import { http, HttpResponse, type HttpHandler } from "msw"
import type { PageId } from "@/features/shell"
import { myselfHandlers, type MyselfHandlersOptions } from "./myself-fixture"

/**
 * Every planned read of a page answered with an empty, valid default, for
 * unit tests (spec F7-1; the e2e twins are `e2e/fixtures/defaults-*.ts`).
 * A test installs its page's handlers first, then overrides only what it is
 * about with `server.use(…)` (the newest handler wins):
 *
 *   server.use(...profileReadHandlers({ contacts: { Email: [contactPointWire({ type: "Email" })] } }))
 *
 * Ownership: `shellReadHandlers` is foundation (the header and frame reads of
 * both pages); `profileReadHandlers` belongs to Team A and
 * `accountReadHandlers` to Team B. A story that adds a read to its page adds
 * its default here, in its own team's function, never in the other's.
 */

export type PageReadOptions = MyselfHandlersOptions

/** Foundation: `myself`, the Contact Points (header, both pages) and the header's picture id (no picture). */
export function shellReadHandlers(options: PageReadOptions = {}): HttpHandler[] {
  return [...myselfHandlers(options), http.get("/api/pp/profile-picture-id", () => HttpResponse.json({ fileId: null }))]
}

// ── Team A: `/` (Epics 1–6). Edit only this function for a new `/` read. ──

/** `/`: the shell reads + type keys (Person, ContactPoint, Insurance), addresses, countries, insurance. */
export function profileReadHandlers(options: PageReadOptions = {}): HttpHandler[] {
  return [
    ...shellReadHandlers(options),
    http.get("/api/1h/v2/type/key/:type", ({ params }) => HttpResponse.json({ boKey: params.type, attributes: [] })),
    http.get("/api/1h/v2/person/location/list", () => HttpResponse.json([])),
    http.get("/api/1h/v2/public/countries", () => HttpResponse.json([])),
    http.get("/api/1h/v2/health/patient/insurance", () => HttpResponse.json([])),
  ]
}

// ── Team B: `/account` (Epics 7–10). Edit only this function for a new `/account` read. ──

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

/** The read handlers of `page`. */
export function pageReadHandlers(page: PageId, options: PageReadOptions = {}): HttpHandler[] {
  return page === "profile" ? profileReadHandlers(options) : accountReadHandlers(options)
}
