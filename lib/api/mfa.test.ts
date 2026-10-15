import { describe, expect, it } from "vitest"
import { mfaDisableTotpPath, mfaEnableTotpPath, mfaValidatePath } from "."

/** Authenticator app (Team B, Epic 8). Team B adds its own cases here. */
describe("mfa", () => {
  it("paths", () => {
    expect(mfaEnableTotpPath()).toBe("/api/1h/v2/mfa/enable/totp")
    expect(mfaDisableTotpPath()).toBe("/api/1h/v2/mfa/disable/totp")
    expect(mfaValidatePath()).toBe("/api/pp/mfa/validate")
  })
})
