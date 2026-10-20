import { describe, expect, it } from "vitest"
import { ALLOWLIST } from "./index"
import { entries } from "./npi"

/**
 * Individual Provider Registration (Team B, Epic 9) allowlist rows.
 * Pre-created by spec F7-1 so each story adds its rows here, in its own area
 * file, never in a shared table. Add each new entry to the list below in the
 * same change.
 */
describe("npi allowlist area", () => {
  it("has its two read entries, all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual(["GET v2/user/npi", "GET v2/public/npi/list"])
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
import { setLogSink } from "@/lib/server/log"

beforeEach(() => stubServerEnv())
async function readNpi(path: string, disabled = false) {
  return createProxyHandler({ env: testEnv(disabled ? { ACCOUNT_DISABLED: "1" } : {}), now: () => NOW })(new Request(`http://localhost:3000/api/1h/${path}`, { headers: { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession())}` } }))
}
it.each(["v2/user/npi", "v2/public/npi/list?entityTypeCode=1&searchText=Sensitive+Query&page=0&limit=10", "v2/public/npi/list?entityTypeCode=2&searchText=&page=9999&limit=1"])("forwards %s with private no-store and template-only logging", async (path) => {
  const logs: string[] = []
  const restore = setLogSink({ info: (line) => logs.push(line), warn: (line) => logs.push(line), error: (line) => logs.push(line) })
  const route = path.split("?")[0]
  server.use(http.get(`${DEMO.apiBase}/${route}`, ({ request }) => {
    expect(new URL(request.url).searchParams.get("entityTypeCode")).toBe(new URL(`http://local/${path}`).searchParams.get("entityTypeCode"))
    return HttpResponse.json({ sensitive: "Result Payload" })
  }))
  try {
    const response = await readNpi(path)
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(JSON.stringify(logs)).not.toMatch(/Sensitive|Query|Result Payload|searchText|entityTypeCode/)
    expect(JSON.stringify(logs)).toContain(route)
  } finally { restore() }
})
it.each([
  "v2/user/npi?anything=1", "v2/public/npi/list", "v2/public/npi/list?entityTypeCode=3",
  "v2/public/npi/list?entityTypeCode=1&unknown=x", "v2/public/npi/list?entityTypeCode=1&limit=11",
  "v2/public/npi/list?entityTypeCode=1&limit=0", "v2/public/npi/list?entityTypeCode=1&limit=1.5",
  "v2/public/npi/list?entityTypeCode=1&page=12345", "v2/public/npi/list?entityTypeCode=1&page=-1",
  "v2/public/npi/list?entityTypeCode=1&entityTypeCode=2", `v2/public/npi/list?entityTypeCode=1&searchText=${"a".repeat(101)}`,
])("rejects invalid query without upstream work: %s", async (path) => {
  const calls = trackAllRequests()
  const response = await readNpi(path)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ errorCode: "BAD_QUERY", source: "proxy" })
  expect(calls()).toBe(0)
})
it.each(["v2/user/npi", "v2/public/npi/list?entityTypeCode=1"])("Account switch blocks %s", async (path) => {
  const calls = trackAllRequests()
  const response = await readNpi(path, true)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
  expect(calls()).toBe(0)
})
