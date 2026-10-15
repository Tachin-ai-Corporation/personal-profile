import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createPracticeSupportHandler, supportContact } from "./practice-support"

const PATH = "/api/pp/practice-support"
const NPI = `${DEMO.apiBase}/v2/user/npi`
const SYS_CONFIG = `${DEMO.apiBase}/v2/tenant/sys-config`
const handler = createPracticeSupportHandler({ env: testEnv(), now: () => NOW })
const get = (extra: object = {}) => callOp(handler, { path: PATH, ...extra })

const npi = (tenantId: unknown) => ({ providerNpi: { id: 1 }, practiceNpi: { id: 2, npi: 99, organization: { id: 5, name: "Clinic", tenantId } }, hieEndpoint: null })
const config = (overrides: object = {}) => ({
  tenantId: 7,
  tenantName: "Clinic tenant",
  supportEmail: "help@clinic.test",
  supportPhone: "+1 415 555 0100",
  supportPhoneRegion: "US",
  supportPageURL: "https://clinic.test/help",
  primaryColor: "#000",
  allowedDomains: ["clinic.test"],
  organization: { name: "Clinic Group LLC", shortOrganizationName: "Clinic", personContacts: [{ email: "ceo@clinic.test" }] },
  ...overrides,
})

beforeEach(() => stubServerEnv())

describe("GET /api/pp/practice-support", () => {
  it("reads user/npi, then sys-config with exactly Tenant IDs + includeAllRelations, and answers only the support contact", async () => {
    let search = ""
    server.use(
      http.get(NPI, () => HttpResponse.json(npi(7))),
      http.get(SYS_CONFIG, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json([config()])
      }),
    )
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: "Clinic", phone: "+1 415 555 0100", phoneRegion: "US", email: "help@clinic.test" })
    expect(search).toBe("?Tenant%20IDs=7&includeAllRelations=true")
    expectNoStore(response)
  })

  it.each([
    ["no practice NPI", { providerNpi: null, practiceNpi: null }],
    ["a practice without an organization", { practiceNpi: { organization: null } }],
    ["an organization without a tenant", { practiceNpi: { organization: { tenantId: null } } }],
    ["an empty body", null],
    ["a tenant id above 2^53", npi(9007199254740993)],
    ["a string tenant id above 2^53", npi("1234567890123456789")],
    ["a negative tenant id", npi(-1)],
    ["a fractional tenant id", npi(1.5)],
    ["user/npi 404 (no NPI record)", 404],
  ])("%s → 404 NO_PRACTICE, no sys-config call", async (_label, body) => {
    let sysConfigCalls = 0
    server.use(
      http.get(NPI, () =>
        body === null
          ? new HttpResponse(null, { status: 200 })
          : body === 404
            ? HttpResponse.json({ message: "Not found" }, { status: 404 })
            : HttpResponse.json(body),
      ),
      http.get(SYS_CONFIG, () => {
        sysConfigCalls += 1
        return HttpResponse.json([])
      }),
    )
    await expectBffError(await get(), 404, "NO_PRACTICE")
    expect(sysConfigCalls).toBe(0)
  })

  it("accepts a string tenant id and answers {} when sys-config has no matching tenant", async () => {
    server.use(
      http.get(NPI, () => HttpResponse.json(npi("12"))),
      http.get(SYS_CONFIG, () => HttpResponse.json([config({ tenantId: 99 })])),
    )
    expect(await (await get()).json()).toEqual({})
  })

  it.each([
    ["user/npi 403", () => HttpResponse.json({ message: "Forbidden", code: 3 }, { status: 403 }), undefined, 403, { message: "Forbidden", code: 3 }],
    ["sys-config 403", () => HttpResponse.json(npi(7)), () => HttpResponse.json({ message: "Forbidden" }, { status: 403 }), 403, { message: "Forbidden" }],
    ["user/npi 400", () => HttpResponse.json({ message: "x" }, { status: 400 }), undefined, 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
    ["sys-config 404", () => HttpResponse.json(npi(7)), () => HttpResponse.json({ message: "x" }, { status: 404 }), 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
    ["user/npi 500", () => new HttpResponse(null, { status: 500 }), undefined, 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
    ["user/npi 401", () => new HttpResponse(null, { status: 401 }), undefined, 401, { errorCode: "TOKEN_EXPIRED", source: "proxy" }],
    ["user/npi not an object", () => HttpResponse.json([1]), undefined, 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
    ["sys-config not an array", () => HttpResponse.json(npi(7)), () => HttpResponse.json({ a: 1 }), 502, { errorCode: "UPSTREAM_ERROR", source: "proxy" }],
  ])("%s → %i", async (_label, npiResolver, configResolver, status, body) => {
    server.use(http.get(NPI, npiResolver), http.get(SYS_CONFIG, configResolver ?? (() => HttpResponse.json([]))))
    const response = await get()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })

  it.each([
    ["a client query", { path: `${PATH}?Tenant%20IDs=1` }, {}, 400, "BAD_QUERY"],
    ["no session", { session: null }, {}, 401, "SESSION_EXPIRED"],
    ["PP_DISABLED=1", {}, { PP_DISABLED: "1" }, 503, "SERVICE_DISABLED"],
    ["ACCOUNT_DISABLED=1", {}, { ACCOUNT_DISABLED: "1" }, 503, "SERVICE_DISABLED"],
  ] as const)("%s → %i %s, no upstream call", async (_label, extra, env, status, errorCode) => {
    const calls = trackAllRequests()
    const h = createPracticeSupportHandler({ env: testEnv(env), now: () => NOW })
    await expectBffError(await callOp(h, { path: PATH, ...extra }), status, errorCode)
    expect(calls()).toBe(0)
  })
})

describe("supportContact", () => {
  it.each([
    ["nothing", undefined, {}],
    ["blank strings and nulls", { supportEmail: " ", supportPhone: null, organization: null, tenantName: "" }, {}],
    ["name from organization.name", { organization: { name: "Full Name" } }, { name: "Full Name" }],
    ["name from tenantName", { tenantName: " Tenant " }, { name: "Tenant" }],
  ])("%s → %j", (_label, input, expected) => {
    expect(supportContact(input)).toEqual(expected)
  })
})
