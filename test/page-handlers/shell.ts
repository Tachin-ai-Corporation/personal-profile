import { http, HttpResponse, type HttpHandler } from "msw"
import { myselfHandlers, type MyselfHandlersOptions } from "../myself-fixture"

/**
 * Foundation-owned (spec F7-1): the reads of the shell and the shared header
 * on both pages. Each page's handlers (`profile.ts`, Team A; `account.ts`,
 * Team B) start with these. A header read added here reaches both teams.
 */

export type PageReadOptions = MyselfHandlersOptions

/** `myself`, the Contact Points (header, both pages) and the header's picture id (no picture). */
export function shellReadHandlers(options: PageReadOptions = {}): HttpHandler[] {
  return [...myselfHandlers(options), http.get("/api/pp/profile-picture-id", () => HttpResponse.json({ fileId: null }))]
}
