import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv } from "@/test/env-fixture"
import { expectBffError } from "@/test/named-op-fixture"
import { trackAllRequests } from "@/test/msw-server"
import { makeSession } from "@/test/session-fixture"
import { setLogSink } from "@/lib/server/log"
import { sealSession, SESSION_COOKIE } from "@/lib/server/session/session"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT, dynamic } from "./route"

const PATH = BFF_PATHS.handoffPortal
const methods = { GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE }
let restoreLog: () => void
let networkCalls: () => number
let errors: string[]
beforeEach(() => {
  stubServerEnv()
  errors = []
  restoreLog = setLogSink({ info: () => {}, warn: () => {}, error: (line) => errors.push(line) })
  networkCalls = trackAllRequests()
})
afterEach(() => {
  restoreLog()
  expect(networkCalls()).toBe(0)
})

describe("/handoff/portal route", () => {
  it("forces dynamic rendering and explicitly shares the guarded handler across every method", () => {
    expect(dynamic).toBe("force-dynamic")
    for (const handler of Object.values(methods)) expect(handler).toBe(GET)
  })

  it("GET works without authentication and never sets a cookie", async () => {
    const response = await GET(new Request(`http://localhost:3000${PATH}?to=create-org`))
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("https://1health.app.1health.io/organizations/create")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Pragma")).toBe("no-cache")
    expect(response.headers.get("Vary")).toBe("Cookie")
    expect(response.headers.has("Set-Cookie")).toBe(false)
    expect(await response.text()).toBe("")
  })

  it("GET uses the actual sealed session rather than remembered environment", async () => {
    const seal = await sealSession(makeSession({ environment: "demo" }))
    const response = await GET(new Request(`http://localhost:3000${PATH}?to=tenant&tenantId=1234567890123456789`, { headers: { cookie: `${SESSION_COOKIE}=${seal}; onehealth_environment=prod` } }))
    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("https://1health.demo.1health.io/")
    expect(response.headers.has("Set-Cookie")).toBe(false)
  })

  it.each(Object.entries({ HEAD, OPTIONS, POST, PUT, PATCH, DELETE }))("explicit %s export returns 405 without redirect or cookies", async (method, handler) => {
    const response = await handler(new Request(`http://localhost:3000${PATH}?to=create-org`, { method }))
    await expectBffError(response, 405, "METHOD_NOT_ALLOWED")
    expect(response.headers.has("Location")).toBe(false)
    expect(response.headers.has("Set-Cookie")).toBe(false)
  })

  describe.each(["PP_DISABLED", "ACCOUNT_DISABLED"])("%s defense in depth", (flag) => {
    it.each(Object.entries(methods))("%s returns the shared disabled envelope", async (method, handler) => {
      stubServerEnv({ [flag]: "1" })
      const response = await handler(new Request(`http://localhost:3000${PATH}?to=create-org`, { method }))
      await expectBffError(response, 503, "SERVICE_DISABLED")
      expect(response.headers.get("Retry-After")).toBe("300")
      expect(response.headers.has("Location")).toBe(false)
      expect(response.headers.has("Set-Cookie")).toBe(false)
    })
  })

  it("guards unexpected server configuration errors with a PHI-free 500", async () => {
    stubServerEnv({ SESSION_SECRET: "PatientSecret" })
    const response = await GET(new Request(`http://localhost:3000${PATH}?patient=PatientSecret`))
    await expectBffError(response, 500, "INTERNAL_ERROR")
    expect(response.headers.has("Location")).toBe(false)
    expect(response.headers.has("Set-Cookie")).toBe(false)
    expect(errors).toHaveLength(1)
    expect(JSON.parse(errors[0]!)).toEqual({ kind: "error", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), routeTemplate: PATH, status: 500, errorName: "ServerEnvError" })
  })
})
