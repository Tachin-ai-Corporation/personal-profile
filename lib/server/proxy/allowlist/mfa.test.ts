import { describe, expect, it } from "vitest"
import { ALLOWLIST } from "./index"
import { entries } from "./mfa"

/**
 * Authenticator app (Team B, Epic 8) allowlist rows. Pre-created by spec F7-1
 * so each story adds its rows here, in its own area file, never in a shared
 * table. Add each new entry to the list below in the same change.
 */
describe("mfa allowlist area", () => {
  it("has its planned entries (none yet), all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
  })

  it("every entry is /account-only (`profile: true`, so ACCOUNT_DISABLED turns it off)", () => {
    expect(entries.filter((entry) => entry.profile !== true)).toEqual([])
  })
})
