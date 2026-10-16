import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { trackAllRequests } from "@/test/msw-server"
import { NOW } from "@/test/session-fixture"
import { createProxyHandler } from "../handler"
import { ALLOWLIST } from "./index"
import { entries } from "./account"

/**
 * Personal account settings (Team B, Epic 7) allowlist rows. Pre-created by
 * spec F7-1 so each story adds its rows here, in its own area file, never in
 * a shared table. Add each new entry to the list below in the same change.
 * The shared `PUT v2/user/edit` contract is `user-edit.account.test.ts`.
 */
describe("account allowlist area", () => {
  it("has its planned entries (none yet), all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
  })

  it("every entry is /account-only (`profile: true`, so ACCOUNT_DISABLED turns it off)", () => {
    expect(entries.filter((entry) => entry.profile !== true)).toEqual([])
  })
})

describe("Story 7.2: account proxy rejections with the shipped allowlist", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  let upstreamCalls: () => number

  beforeEach(() => {
    stubServerEnv()
    upstreamCalls = trackAllRequests()
  })

  afterEach(() => expect(upstreamCalls()).toBe(0))

  async function expectRejection(method: string, path: string, status: number, errorCode: string, handler = proxy) {
    // No session: path/deny/allowlist rejection must precede authentication.
    const response = await handler(new Request(`http://localhost:3000/api/1h/${path}`, { method }))

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Pragma")).toBe("no-cache")
    expect(response.headers.get("Vary")).toBe("Cookie")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  }

  it.each([
    ["POST", "v2/mfa/enable"],
    ["POST", "v2/mfa/enable/123"],
    ["GET", "v2/mfa/validate/123"],
    ["GET", "v2/mfa/validate?code=123456"],
    ["GET", "v2/user/switch-tenant/5"],
    ["POST", "v2/user/update-password"],
    ["GET", "v2/tenant/sys-config"],
  ])("denies %s %s before authentication or upstream", async (method, path) => {
    await expectRejection(method, path, 403, "NOT_ALLOWED")
  })

  // Unlike an unlisted endpoint, an explicit deny must survive an accidental
  // allowlist addition. GET mfa/validate?code stays unlisted (named op only).
  it.each([
    ["POST", "v2/mfa/enable"],
    ["POST", "v2/mfa/enable/123"],
    ["GET", "v2/mfa/validate/123"],
    ["GET", "v2/user/switch-tenant/5"],
    ["POST", "v2/user/update-password"],
    ["GET", "v2/tenant/sys-config"],
  ] as const)("explicit deny wins over an accidental allow: %s %s", async (method, template) => {
    const handler = createProxyHandler({
      allowlist: [...ALLOWLIST, { method, template, profile: true }],
      env: testEnv(),
      now: () => NOW,
    })
    await expectRejection(method, template, 403, "NOT_ALLOWED", handler)
  })

  it.each([
    ["POST", "v2/user/..%2Fmfa/enable", 400, "BAD_PATH"],
    // Request removes literal/encoded dot segments before the handler sees them:
    // these become v2/mfa/enable/ (bad trailing slash) and v2/validate/1 (unlisted).
    ["POST", "v2/mfa/enable/totp/..", 400, "BAD_PATH"],
    ["GET", "v2/mfa/%2e%2e/validate/1", 403, "NOT_ALLOWED"],
    ["GET", "v2/user/%252Fswitch-tenant/1", 400, "BAD_PATH"],
    ["GET", "//evil.example/v2/user/npi", 400, "BAD_PATH"],
    ["GET", "v2/user/npi;x", 400, "BAD_PATH"],
    ["GET", "v2/user/npi/", 400, "BAD_PATH"],
    ["POST", "v2/MFA/enable/totp", 403, "NOT_ALLOWED"],
  ])("rejects traversal %s %s → %i %s", async (method, path, status, errorCode) => {
    await expectRejection(method, path, status, errorCode)
  })
})
