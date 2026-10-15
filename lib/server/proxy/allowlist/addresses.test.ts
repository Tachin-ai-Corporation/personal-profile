import { describe, expect, it } from "vitest"
import { ALLOWLIST } from "./index"
import { entries } from "./addresses"

/**
 * Addresses (Team A, Epic 4) allowlist rows. Pre-created by spec F7-1 so each
 * story adds its rows here, in its own area file, never in a shared table.
 * Add each new entry to the list below in the same change.
 */
describe("addresses allowlist area", () => {
  it("has its planned entries (none yet), all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
  })

  it("no entry is tagged `profile` (`/` entries stay on when ACCOUNT_DISABLED is set)", () => {
    expect(entries.filter((entry) => entry.profile !== undefined)).toEqual([])
  })
})
