import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { E2E_MOCK_CREDENTIALS, resetServerEnvCache } from "@/lib/server/env"
import { exchangeCode, fetchMyselfIds, readTenantId } from "@/lib/server/launch/exchange"
import { revokeAllDevices } from "@/lib/server/session/revoke"
import { E2E_MOCK_ENV, stubServerEnv, testEnv } from "./env-fixture"
import { installUpstreamMock, MOCK_MYSELF, uninstallUpstreamMock } from "./e2e-upstream-mock"
import { server } from "./msw-server"
import { DEMO, DEV, PROD } from "./upstream-fixture"

/** The fetch in place before each test (MSW's interceptor, installed in beforeAll). */
let realFetch: typeof fetch
beforeEach(() => {
  realFetch = globalThis.fetch
})
const context = { requestId: "r", routeTemplate: "/test" }

afterEach(() => {
  uninstallUpstreamMock()
  resetServerEnvCache()
})

function install(): void {
  stubServerEnv(E2E_MOCK_ENV)
  installUpstreamMock()
}

describe("e2e upstream mock (spec R5-1)", () => {
  it("refuses to install without PP_E2E_MOCK=1, leaving fetch untouched", () => {
    stubServerEnv()
    expect(() => installUpstreamMock()).toThrow("PP_E2E_MOCK=1")
    expect(globalThis.fetch).toBe(realFetch)
  })

  it("re-checks the credentials itself: a non-e2e key or app id refuses to install, naming the variables only", () => {
    // Names come from env.ts, so this file never spells a `_DEMO`/`_PROD` name (check-forbidden).
    const [demoKey, prodKey, demoApp, prodApp] = E2E_MOCK_CREDENTIALS
    const env = { ...testEnv({ [demoApp]: "e2e-app-demo" })(), PP_E2E_MOCK: true }
    expect(() => installUpstreamMock(env)).toThrow(`The e2e upstream mock needs e2e dummy credentials: ${demoKey}, ${prodKey}, ${prodApp}`)
    expect(globalThis.fetch).toBe(realFetch)
  })

  it("re-checks a set dev pair too (D18), and accepts an unset one", () => {
    const [, , , , devKey, devApp] = E2E_MOCK_CREDENTIALS
    const env = { ...testEnv({ ...E2E_MOCK_ENV, PP_E2E_MOCK: "0", [devApp]: "real-app-dev" })(), PP_E2E_MOCK: true }
    expect(() => installUpstreamMock(env)).toThrow(`The e2e upstream mock needs e2e dummy credentials: ${devApp}`)
    expect(globalThis.fetch).toBe(realFetch)
    const withoutDev = { ...testEnv({ ...E2E_MOCK_ENV, PP_E2E_MOCK: "0", [devKey]: "", [devApp]: "" })(), PP_E2E_MOCK: true }
    expect(() => installUpstreamMock(withoutDev)).not.toThrow()
  })

  it("installs once and uninstalls back to the real fetch", () => {
    install()
    const patched = globalThis.fetch
    expect(patched).not.toBe(realFetch)
    installUpstreamMock()
    expect(globalThis.fetch).toBe(patched)
    uninstallUpstreamMock()
    expect(globalThis.fetch).toBe(realFetch)
    uninstallUpstreamMock()
    expect(globalThis.fetch).toBe(realFetch)
  })

  it.each([DEMO, PROD, DEV])("exchanges a code once on $label: distinct tenant-1 tokens, then the recorded 'already redeemed' 400", async ({ apiRoot }) => {
    install()
    const first = await exchangeCode(apiRoot, "code-a", "key")
    const second = await exchangeCode(apiRoot, "code-b", "key")
    expect(first.kind === "ok" && readTenantId(first.tokens.accessToken)).toBe(1)
    expect(first.kind === "ok" && second.kind === "ok" && first.tokens.accessToken !== second.tokens.accessToken).toBe(true)
    expect(await exchangeCode(apiRoot, "code-a", "key")).toEqual({ kind: "failed", reason: "used" })
  })

  it("treats an unreadable exchange body as the empty code", async () => {
    install()
    const post = (body: string) => fetch(`${DEMO.apiRoot}/api/v2/public/external-application/auth/oauth2/user/token`, { method: "POST", body })
    expect((await post("{oops")).status).toBe(200)
    expect((await post(JSON.stringify({ securityCode: 7 }))).status).toBe(400)
  })

  it("answers myself with the frozen ANN until the token is revoked, then 401", async () => {
    install()
    const exchanged = await exchangeCode(DEMO.apiRoot, "code-m", "key")
    const token = exchanged.kind === "ok" ? exchanged.tokens.accessToken : ""
    expect(await fetchMyselfIds(DEMO.apiRoot, token)).toEqual({ userId: 42, personId: 4242 })
    const body: unknown = await (await fetch(new URL(`${DEMO.apiRoot}/api/v2/user/myself`), { headers: { Authorization: `Bearer ${token}` } })).json()
    expect(body).toEqual(MOCK_MYSELF)
    await revokeAllDevices(DEMO.apiRoot, token, context)
    expect(await fetchMyselfIds(DEMO.apiRoot, token)).toBeNull()
    expect((await fetch(new Request(`${DEMO.apiRoot}/api/v2/user/myself`))).status).toBe(200)
  })

  it.each([
    ["GET", DEMO.apiRoot, "/api/v2/user/contact-point/list?type=Email"],
    ["POST", PROD.apiRoot, "/auth/oauth2/token"],
    ["GET", DEV.apiRoot, "/api/v2/user/contact-point/list?type=Email"],
  ])("fails closed on any other 1health call (%s %s%s): 599 E2E_UNMOCKED, logged", async (method, apiRoot, path) => {
    install()
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await fetch(`${apiRoot}${path}`, method === "GET" ? undefined : { method })
    expect(response.status).toBe(599)
    expect(await response.json()).toEqual({ message: "E2E_UNMOCKED", code: 599 })
    expect(logged).toHaveBeenCalledWith(`e2e upstream mock: unmocked 1health call ${method} ${path.split("?")[0]}`)
  })

  it("passes other hosts (look-alikes included) to the real fetch", async () => {
    install()
    server.use(
      http.get("https://places.example.test/v1/places", () => HttpResponse.json(["real"])),
      http.get("https://1health.demo.1health.io.evil.test/api/v2/user/myself", () => HttpResponse.json(["evil"])),
    )
    expect(await (await fetch("https://places.example.test/v1/places")).json()).toEqual(["real"])
    expect(await (await fetch("https://1health.demo.1health.io.evil.test/api/v2/user/myself")).json()).toEqual(["evil"])
  })
})
