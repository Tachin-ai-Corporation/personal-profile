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
  it("has its two reads and the availability/registration entries, all aggregated into the shipped allowlist", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual(["GET v2/user/npi", "GET v2/public/npi/list", "GET v2/health/npi/{n}/is-registered", "POST v2/user/register/npi"])
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

async function registerThroughProxy(options: { method?: string; path?: string; body?: string; contentType?: string | null; disabled?: boolean } = {}) {
  const headers: Record<string, string> = { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession())}` }
  const contentType = options.contentType === undefined ? "application/json" : options.contentType
  if (contentType !== null) headers["Content-Type"] = contentType
  const method = options.method ?? "POST"
  return createProxyHandler({ env: testEnv(options.disabled ? { ACCOUNT_DISABLED: "1" } : {}), now: () => NOW })(new Request(`http://localhost:3000/api/1h/${options.path ?? "v2/user/register/npi"}`, { method, headers, ...(method !== "GET" ? { body: options.body ?? JSON.stringify({ providerNpiId: 77 }) } : {}) }))
}

it.each([false, true])("forwards raw availability %j with no-store and only the route template in logs", async (registered) => {
  const logs: string[] = []
  const restore = setLogSink({ info: (line) => logs.push(line), warn: (line) => logs.push(line), error: (line) => logs.push(line) })
  server.use(http.get(`${DEMO.apiBase}/v2/health/npi/789123/is-registered`, ({ request }) => {
    expect(new URL(request.url).search).toBe("")
    return HttpResponse.json(registered)
  }))
  try {
    const response = await readNpi("v2/health/npi/789123/is-registered")
    expect(response.status).toBe(200)
    expect(await response.json()).toBe(registered)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(JSON.stringify(logs)).toContain("v2/health/npi/{n}/is-registered")
    expect(JSON.stringify(logs)).not.toContain("789123")
  } finally { restore() }
})
it.each([{ providerNpiId: 789123 }, { providerNpiId: 789123, practiceNpiId: 987321 }])("forwards the exact registration body %j and empty200 without logging identifiers", async (body) => {
  const logs: string[] = []
  const restore = setLogSink({ info: (line) => logs.push(line), warn: (line) => logs.push(line), error: (line) => logs.push(line) })
  let posts = 0
  server.use(http.post(`${DEMO.apiBase}/v2/user/register/npi`, async ({ request }) => {
    posts++
    expect(new URL(request.url).search).toBe("")
    expect(await request.json()).toEqual(body)
    return new HttpResponse(null, { status: 200 })
  }))
  try {
    const response = await registerThroughProxy({ body: JSON.stringify(body) })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(posts).toBe(1)
    expect(JSON.stringify(logs)).toContain("v2/user/register/npi")
    expect(JSON.stringify(logs)).not.toMatch(/789123|987321|providerNpiId|practiceNpiId/)
  } finally { restore() }
})
it.each([{}, null, [], { providerNpiId: "77" }, { providerNpiId: null }, { providerNpiId: 0 }, { providerNpiId: -1 }, { providerNpiId: 1.5 }, { providerNpiId: Number.MAX_SAFE_INTEGER + 1 }, { providerNpiId: 77, practiceNpiId: null }, { providerNpiId: 77, practiceNpiId: "88" }, { providerNpiId: 77, practiceNpiId: -1 }, { providerNpiId: 77, practiceNpiId: 0 }, { providerNpiId: 77, practiceNpiId: 1.5 }, { providerNpiId: 77, practiceNpiId: Number.MAX_SAFE_INTEGER + 1 }, { providerNpiId: 77, personId: 42 }])("rejects malformed/unknown registration body %j without upstream", async (body) => {
  const calls = trackAllRequests()
  const response = await registerThroughProxy({ body: JSON.stringify(body) })
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ errorCode: "BAD_BODY", source: "proxy" })
  expect(calls()).toBe(0)
})
it.each([
  [{ body: "{" }, 400, "BAD_BODY"],
  [{ contentType: "text/plain" }, 415, "UNSUPPORTED_MEDIA"],
  [{ contentType: null }, 415, "UNSUPPORTED_MEDIA"],
  [{ path: "v2/user/register/npi?personId=42" }, 400, "BAD_QUERY"],
  [{ path: "v2/user/register/npi?practiceNpiId=88&practiceNpiId=99" }, 400, "BAD_QUERY"],
  [{ method: "GET" }, 405, "METHOD_NOT_ALLOWED"],
  [{ method: "PUT" }, 405, "METHOD_NOT_ALLOWED"],
  [{ method: "POST", path: "v2/health/npi/77/is-registered" }, 405, "METHOD_NOT_ALLOWED"],
] as const)("rejects invalid registration request %j without upstream", async (options, status, errorCode) => {
  const calls = trackAllRequests()
  const response = await registerThroughProxy(options)
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expect(calls()).toBe(0)
})
it.each([
  ["v2/health/npi/77/is-registered?tenantId=42", 400, "BAD_QUERY"],
  ["v2/health/npi/77/is-registered?tenantId=42&tenantId=43", 400, "BAD_QUERY"],
  ["v2/health/npi/no-id/is-registered", 403, "NOT_ALLOWED"],
  ["v2/health/npi/-1/is-registered", 403, "NOT_ALLOWED"],
  ["v2/health/npi/1.5/is-registered", 403, "NOT_ALLOWED"],
  ["v2/health/npi/12345678901234567890/is-registered", 403, "NOT_ALLOWED"],
  ["v2/health/npi/0/is-registered", 400, "BAD_PATH"],
  ["v2/health/npi/007/is-registered", 400, "BAD_PATH"],
  ["v2/health/npi/9007199254740992/is-registered", 400, "BAD_PATH"],
  ["v2/health/npi/9999999999999999999/is-registered", 400, "BAD_PATH"],
] as const)("rejects invalid availability route %s before upstream", async (path, status, errorCode) => {
  const calls = trackAllRequests()
  const response = await readNpi(path)
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ errorCode, source: "proxy" })
  expect(calls()).toBe(0)
})
it("forwards the largest safe NPI row id", async () => {
  server.use(http.get(`${DEMO.apiBase}/v2/health/npi/9007199254740991/is-registered`, () => HttpResponse.json(false)))
  const response = await readNpi("v2/health/npi/9007199254740991/is-registered")
  expect(response.status).toBe(200)
  expect(await response.json()).toBe(false)
})
it("Account switch blocks availability without upstream", async () => {
  const calls = trackAllRequests()
  const response = await readNpi("v2/health/npi/77/is-registered", true)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
  expect(calls()).toBe(0)
})
it("Account switch blocks registration without upstream", async () => {
  const calls = trackAllRequests()
  const response = await registerThroughProxy({ disabled: true })
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ errorCode: "SERVICE_DISABLED", source: "proxy" })
  expect(calls()).toBe(0)
})
