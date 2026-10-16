import { sealData } from "iron-session"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stubServerEnv, testEnv, TEST_DEV_ENV, TEST_ENV } from "@/test/env-fixture"
import { callOp, expectBffError } from "@/test/named-op-fixture"
import { trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { ENVIRONMENTS, environmentConfig } from "@/lib/shared/environments"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { setLogSink } from "@/lib/server/log"
import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, sealSession, SESSION_COOKIE, unsealSession } from "@/lib/server/session/session"
import { buildTenantPortalUrl, createHandoffHandler, resolveHandoffEnvironment, TENANT_HANDOFF_SHAPE } from "./handoff"

const PATH = BFF_PATHS.handoffPortal
const request = (cookie = "", query = "") => new Request(`http://localhost:3000${PATH}${query}`, { headers: { cookie } })
const invalidIds = ["", "0", "0000000000000000000", "-1", "+5", "1.5", "1e3", "12345678901234567890", "%31", "%2531", " 1", "1 ", "1\n", "1\r\n", "１", "١", "1@evil.example", "//evil.example", "https://evil.example", "1?assume=1", "1#fragment", "1&ctx=2", "1\0"]
let restoreLog: () => void
let networkCalls: () => number
let lines: string[]

beforeEach(() => {
  stubServerEnv()
  lines = []
  restoreLog = setLogSink({ info: (line) => lines.push(line), warn: (line) => lines.push(line), error: (line) => lines.push(line) })
  networkCalls = trackAllRequests()
})
afterEach(() => {
  restoreLog()
  vi.useRealTimers()
  expect(networkCalls()).toBe(0)
})

async function expectRedirect(response: Response, target: string) {
  expect(response.status).toBe(303)
  expect(response.headers.get("Location")).toBe(new URL(target).toString())
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  expect(response.headers.get("Pragma")).toBe("no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie")
  expect(response.headers.has("Set-Cookie")).toBe(false)
  expect(await response.text()).toBe("")
}

describe("resolveHandoffEnvironment: real sealed cookies", () => {
  it.each(ENVIRONMENTS)("prefers the %s session over remembered environment", async (environment) => {
    stubServerEnv(TEST_DEV_ENV)
    const seal = await sealSession(makeSession({ environment }))
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=${environment === "prod" ? "demo" : "prod"}`))).toBe(environment)
  })

  it.each(["demo", "prod"] as const)("uses remembered %s without a session", async (environment) => {
    expect(await resolveHandoffEnvironment(request(`onehealth_environment=${environment}`))).toBe(environment)
  })

  it.each(["", "Demo", "PROD", "unknown", "%64emo", "dev"])("defaults to prod for unconfigured/invalid remembered %j", async (value) => {
    expect(await resolveHandoffEnvironment(request(`onehealth_environment=${value}`))).toBe("prod")
  })

  it("uses remembered dev only with the D18 credential pair configured", async () => {
    stubServerEnv(TEST_DEV_ENV)
    expect(await resolveHandoffEnvironment(request("onehealth_environment=dev"))).toBe("dev")
  })

  it.each([
    ["idle", { lastSeen: NOW - IDLE_TIMEOUT_MS - 1 }],
    ["absolute", { iat: NOW - ABSOLUTE_TIMEOUT_MS - 1 }],
    ["access token expired", { accessExpiresAt: NOW - 1 }],
  ])("retains a still-readable sealed session environment despite %s expiry", async (_label, times) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const seal = await sealSession(makeSession({ ...times, environment: "demo" }))
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=prod`))).toBe("demo")
  })

  it.each(["garbage", "Fe26.2*garbage", ""])("falls back from an unreadable seal %j", async (seal) => {
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=demo`))).toBe("demo")
  })

  it("falls back from a seal encrypted with a foreign secret", async () => {
    const seal = await sealSession(makeSession(), { current: "foreign-secret-".repeat(4) })
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=prod`))).toBe("prod")
  })

  it.each([{}, { ...makeSession(), environment: "evil" }, { ...makeSession(), accessToken: "" }])("rejects a genuinely sealed malformed payload %#", async (payload) => {
    const seal = await sealData(payload, { password: TEST_ENV.SESSION_SECRET })
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=prod`))).toBe("prod")
  })

  it("falls back after the real seal TTL expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    const seal = await sealSession(makeSession())
    vi.setSystemTime(NOW + ABSOLUTE_TIMEOUT_MS + 61_000)
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=${seal}; onehealth_environment=prod`))).toBe("prod")
  })

  it("falls back if session reading throws, without mocking the owned session module", async () => {
    stubServerEnv({ SESSION_SECRET: "invalid" })
    expect(await resolveHandoffEnvironment(request(`${SESSION_COOKIE}=unreadable; onehealth_environment=demo`), ["demo", "prod"])).toBe("demo")
  })

  it("ignores environment query and header hints", async () => {
    const req = request("", "?environment=demo&env=dev")
    req.headers.set("referer", "https://1health.demo.1health.io")
    req.headers.set("origin", "https://dev.1hdev.io")
    req.headers.set("x-onehealth-environment", "demo")
    expect(await resolveHandoffEnvironment(req)).toBe("prod")
  })
})

describe("buildTenantPortalUrl", () => {
  it("keeps the approved root fallback as the default", () => {
    expect(TENANT_HANDOFF_SHAPE).toBe("root")
    expect(buildTenantPortalUrl("demo", "1234567890123456789")).toBe(environmentConfig("demo").portalUrl)
  })

  describe.each(ENVIRONMENTS)("%s portal", (environment) => {
    it.each(["1", "0001", "9007199254740993", "1234567890123456789", "9999999999999999999"])("preserves literal %s in ctx and supports root", (tenantId) => {
      const portal = environmentConfig(environment).portalUrl
      expect(buildTenantPortalUrl(environment, tenantId, "root")).toBe(portal)
      expect(buildTenantPortalUrl(environment, tenantId, "ctx")).toBe(`${portal}/?ctx=${tenantId}`)
    })
    it.each(invalidIds)("rejects %j even with ctx enabled", (tenantId) => {
      expect(buildTenantPortalUrl(environment, tenantId, "ctx")).toBe(environmentConfig(environment).portalUrl)
    })
  })
})

describe("createHandoffHandler", () => {
  it.each(ENVIRONMENTS)("redirects tenant/create-org to the sealed %s environment", async (environment) => {
    stubServerEnv(TEST_DEV_ENV)
    const handler = createHandoffHandler()
    for (const [query, suffix] of [["to=tenant&tenantId=1234567890123456789", "/"], ["to=create-org", "/organizations/create"]]) {
      await expectRedirect(await callOp(handler, { path: `${PATH}?${query}`, session: makeSession({ environment }) }), `${environmentConfig(environment).portalUrl}${suffix}`)
    }
  })

  it("is session-less and ignores destination, shape, environment and fragment overrides", async () => {
    await expectRedirect(await createHandoffHandler()(request("", "?to=tenant&tenantId=19&shape=ctx&ctx=999&assume=1&url=https://evil.example&environment=demo#secret")), environmentConfig("prod").portalUrl)
  })

  it("uses configured remembered dev for organization creation", async () => {
    await expectRedirect(await createHandoffHandler({ env: testEnv(TEST_DEV_ENV) })(request("onehealth_environment=dev", "?to=create-org&redirect=https://evil.example#secret")), `${environmentConfig("dev").portalUrl}/organizations/create`)
  })

  it.each([
    "", "to=", "to=Tenant", "to=CREATE-ORG", "to=unknown", "to=tenant", "to=tenant&tenantId", "to=tenant&tenantId=",
    "to=tenant&to=create-org&tenantId=1", "to=create-org&to=create-org", "to=create-org&%74o=tenant", "to=tenant&%74o=tenant&tenantId=1",
    "to=tenant&tenantId=1&tenantId=2", "to=tenant&tenantId=1&tenant%49d=2", "to=tenant&tenant%49d=2&tenantId=1", "to=tenant&tenantId=1&tenantId=1",
    "to=tenant&tenantId=%31", "to=tenant&tenantId=1%32", "to=tenant&tenantId=%2531", "to=tenant&tenantId=%00", "to=tenant&tenantId=%0d%0aLocation:https://evil.example", "to=tenant&tenantId=%",
    ...invalidIds.filter((id) => !/[\s\0]/.test(id)).map((id) => `to=tenant&tenantId=${id}`),
  ])("raw query %j safely falls back to portal root", async (query) => {
    await expectRedirect(await createHandoffHandler()(request("onehealth_environment=demo", `?${query}`)), environmentConfig("demo").portalUrl)
  })

  it.each(["HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"])("%s returns 405 before reading cookies or URL", async (method) => {
    const req = new Request(`http://localhost:3000${PATH}`, { method })
    Object.defineProperty(req, "headers", { get: () => { throw new Error("must not read cookies") } })
    Object.defineProperty(req, "url", { get: () => { throw new Error("must not read URL") } })
    const response = await createHandoffHandler()(req)
    await expectBffError(response, 405, "METHOD_NOT_ALLOWED")
    expect(response.headers.has("Location")).toBe(false)
    expect(response.headers.has("Set-Cookie")).toBe(false)
  })

  it.each(["PP_DISABLED", "ACCOUNT_DISABLED"])("%s takes precedence over method and environment resolution", async (flag) => {
    const req = request()
    Object.defineProperty(req, "headers", { get: () => { throw new Error("must not resolve session") } })
    Object.defineProperty(req, "url", { get: () => { throw new Error("must not parse URL") } })
    // Logging may read method, but a disabled handler must never compare it to GET.
    Object.defineProperty(req, "method", { value: "POST" })
    const response = await createHandoffHandler({ env: testEnv({ [flag]: "1" }) })(req)
    await expectBffError(response, 503, "SERVICE_DISABLED")
    expect(response.headers.get("Retry-After")).toBe("300")
    expect(response.headers.has("Location")).toBe(false)
    expect(response.headers.has("Set-Cookie")).toBe(false)
  })

  it("leaves aged sealed data unchanged and logs only generated metadata", async () => {
    const session = makeSession({ lastSeen: NOW - IDLE_TIMEOUT_MS - 1, accessExpiresAt: NOW - 1 })
    const seal = await sealSession(session)
    const req = request(`${SESSION_COOKIE}=${seal}; onehealth_environment=prod`, "?to=tenant&tenantId=1234567890123456789&name=PatientSecret&ssn=123-45-6789")
    req.headers.set("x-request-id", "PatientSecret")
    req.headers.set("authorization", "Bearer SecretToken")
    const now = vi.fn().mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + 7)
    await expectRedirect(await createHandoffHandler({ now })(req), environmentConfig("demo").portalUrl)
    expect(await unsealSession(seal)).toEqual(session)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({ kind: "request", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), method: "GET", routeTemplate: PATH, status: 303, durationMs: 7 })
  })

  it("does not read or log a rejected method's sensitive body", async () => {
    const req = new Request(`http://localhost:3000${PATH}?secret=QuerySecret`, { method: "POST", body: "PatientSecret SSN 123-45-6789" })
    await expectBffError(await createHandoffHandler()(req), 405, "METHOD_NOT_ALLOWED")
    expect(req.bodyUsed).toBe(false)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({ kind: "request", requestId: expect.any(String), method: "POST", routeTemplate: PATH, status: 405, durationMs: expect.any(Number) })
  })
})
