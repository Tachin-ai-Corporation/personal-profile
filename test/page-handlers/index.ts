import type { HttpHandler } from "msw"
import type { PageId } from "@/features/shell"
import { accountReadHandlers } from "./account"
import { profileReadHandlers } from "./profile"
import type { PageReadOptions } from "./shell"

/**
 * Every planned read of a page answered with an empty, valid default, for
 * unit tests (spec F7-1; the e2e twins are `e2e/fixtures/defaults-*.ts`).
 * Install a page's handlers first, then override only what the test is about
 * with a later `server.use(…)` (the latest call wins):
 *
 *   server.use(...profileReadHandlers({ contacts: { Email: [contactPointWire({ type: "Email" })] } }))
 *
 * One file per owner: `shell.ts` (foundation), `profile.ts` (Team A),
 * `account.ts` (Team B). A story edits only its own team's file.
 */

export { accountReadHandlers } from "./account"
export { profileReadHandlers } from "./profile"
export { shellReadHandlers, type PageReadOptions } from "./shell"

/** The read handlers of `page`. */
export function pageReadHandlers(page: PageId, options: PageReadOptions = {}): HttpHandler[] {
  return page === "profile" ? profileReadHandlers(options) : accountReadHandlers(options)
}
