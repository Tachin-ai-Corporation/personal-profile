import { describe, expect, it } from "vitest"
import { ALLOWLIST } from "./index"
import { entries } from "./orgs"

/**
 * My Organizations (Team B, Epic 10) allowlist rows. Pre-created by spec F7-1
 * so each story adds its rows here, in its own area file, never in a shared
 * table. Add each new entry to the list below in the same change.
 */
describe("orgs allowlist area", () => {
  it("has its organization read, aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual(["GET v2/user/organization/portal"])
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
async function readOrganizations(query = "name=&page=0&size=12", disabled = false, method = "GET") {
  return createProxyHandler({ env: testEnv(disabled ? { ACCOUNT_DISABLED: "1" } : {}), now: () => NOW })(new Request(`http://localhost:3000/api/1h/v2/user/organization/portal?${query}`, { method, headers: { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession())}` } }))
}
it.each(["name=&page=0&size=12", `name=${"a".repeat(100)}&page=9999&size=1`, "name=Private+Clinic&page=2&size=12"])("forwards valid bounded queries with no-store and metadata-only server logging: %s", async (query) => {
  const logs: string[] = []
  const restore = setLogSink({ info: (line) => logs.push(line), warn: (line) => logs.push(line), error: (line) => logs.push(line) })
  server.use(http.get(`${DEMO.apiBase}/v2/user/organization/portal`, ({ request }) => {
    expect(new URL(request.url).searchParams.toString()).toBe(new URLSearchParams(query).toString())
    return HttpResponse.json({ data: [{ name: "Sensitive Organization", email: "private@example.test" }] })
  }))
  try {
    const response = await readOrganizations(query)
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(JSON.stringify(logs)).toContain("v2/user/organization/portal")
    expect(JSON.stringify(logs)).not.toMatch(/Private|Clinic|Sensitive|private@example|name=|page=|size=/)
  } finally { restore() }
})
it.each([
  "name=&page=0&size=13", "name=&page=0&size=0", "name=&page=0&size=1.5",
  "name=&page=12345&size=12", "name=&page=-1&size=12", "name=&page=1.5&size=12",
  `name=${"a".repeat(101)}&page=0&size=12`, "page=0&size=12", "name=&size=12", "name=&page=0",
  "name=&name=x&page=0&size=12", "name=&page=0&page=1&size=12", "name=&page=0&size=12&size=1",
  "name=&page=0&size=12&unknown=x",
])("rejects invalid query without any upstream call: %s", async (query) => {
  const calls = trackAllRequests()
  const response = await readOrganizations(query)
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ source: "proxy", errorCode: "BAD_QUERY" })
  expect(calls()).toBe(0)
})
it("honors ACCOUNT_DISABLED before upstream work", async () => {
  const calls = trackAllRequests()
  const response = await readOrganizations(undefined, true)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ source: "proxy", errorCode: "SERVICE_DISABLED" })
  expect(calls()).toBe(0)
})
it.each(["POST", "PUT", "DELETE", "HEAD"])("rejects the unsupported method %s without upstream work", async (method) => {
  const calls = trackAllRequests()
  expect((await readOrganizations(undefined, false, method)).status).toBe(405)
  expect(calls()).toBe(0)
})
