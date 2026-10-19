import { describe, expect, it } from "vitest"
import { ALLOWLIST } from "./index"
import { entries } from "./mfa"

/**
 * Authenticator app (Team B, Epic 8) allowlist rows. Pre-created by spec F7-1
 * so each story adds its rows here, in its own area file, never in a shared
 * table. Add each new entry to the list below in the same change.
 */
describe("mfa allowlist area", () => {
  it("has its planned enable entry, all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual(["POST v2/mfa/enable/totp"])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
  })

  it("every entry is /account-only (`profile: true`, so ACCOUNT_DISABLED turns it off)", () => {
    expect(entries.filter((entry) => entry.profile !== true)).toEqual([])
  })
})

import { beforeEach } from "vitest"
import { http, HttpResponse } from "msw"
import { createProxyHandler } from "../handler"
import { testEnv, stubServerEnv } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { server, trackAllRequests } from "@/test/msw-server"
import { DEMO } from "@/test/upstream-fixture"

beforeEach(() => stubServerEnv())
async function send(path: string, body?: string, disabled = false, method = "POST") {
  const handler = createProxyHandler({ env: testEnv(disabled ? { ACCOUNT_DISABLED: "1" } : {}), now: () => NOW })
  return handler(new Request(`http://localhost:3000/api/1h/${path}`, { method, body, headers: { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession())}` } }))
}
it("forwards only the bodyless, queryless enable POST with private no-store", async () => {
  let calls = 0
  server.use(http.post(`${DEMO.apiBase}/v2/mfa/enable/totp`, async ({ request }) => {
    calls++
    expect(new URL(request.url).search).toBe("")
    expect(await request.text()).toBe("")
    return HttpResponse.json({ qrCode: "redacted" })
  }))
  const response = await send("v2/mfa/enable/totp")
  expect(response.status).toBe(200)
  expect(calls).toBe(1)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
})
it.each([
  ["v2/mfa/enable/totp?code=123456", undefined, false, "POST", 400, "BAD_QUERY"],
  ["v2/mfa/enable/totp", "{}", false, "POST", 400, "BAD_BODY"],
  ["v2/mfa/enable/totp", undefined, true, "POST", 503, "SERVICE_DISABLED"],
  ["v2/mfa/enable", undefined, false, "POST", 403, "NOT_ALLOWED"],
  ["v2/mfa/enable/123", undefined, false, "POST", 403, "NOT_ALLOWED"],
  ["v2/mfa/validate", undefined, false, "POST", 403, "NOT_ALLOWED"],
  ["v2/mfa/validate/123", undefined, false, "GET", 403, "NOT_ALLOWED"],
  ["v2/mfa/enable/totp", undefined, false, "GET", 405, "METHOD_NOT_ALLOWED"],
] as const)("rejects %s without upstream work", async (path, body, disabled, method, status, errorCode) => {
  const calls = trackAllRequests()
  const response = await send(path, body, disabled, method)
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expect(calls()).toBe(0)
})
