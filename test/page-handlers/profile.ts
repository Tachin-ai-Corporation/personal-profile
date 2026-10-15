import { http, HttpResponse, type HttpHandler } from "msw"
import { shellReadHandlers, type PageReadOptions } from "./shell"

/**
 * Team A owns this file (spec F7-1): every planned read of `/` answered with
 * an empty, valid default (the e2e twin is `e2e/fixtures/defaults-profile.ts`).
 * A Team A story that adds a read on `/` adds its default here in the same
 * change.
 */

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
