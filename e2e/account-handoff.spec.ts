import { expect, type APIResponse } from "@playwright/test"
import { environmentConfig } from "../lib/shared/environments"
import { ACCOUNT_DISABLED_URL, PP_DISABLED_URL } from "./server-env"
import { sealedSessionCookie } from "./session-cookie"
import { test } from "./fixtures"

const ROUTE = "/handoff/portal"

function expectHardened(response: APIResponse): void {
  const headers = response.headers()
  expect(headers).toMatchObject({
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
  })
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(headers["content-security-policy"]).toMatch(/'nonce-[A-Za-z0-9+/=]+'/)
  expect(headers.vary).toMatch(/(^|,\s*)Cookie(,|$)/i)
  expect(headers["set-cookie"]).toBeUndefined()
}

for (const environment of ["demo", "prod", "dev"] as const) {
  for (const destination of ["", "?to=tenant&tenantId=9999999999999999999&assume=admin#discard", "?to=create-org&next=https://evil.example/#discard"]) {
    test(`handoff ${environment} ${destination || "bare"}: session-less exact target and headers`, async ({ request }) => {
      const response = await request.get(`${ROUTE}${destination}`, {
        maxRedirects: 0,
        headers: { cookie: `onehealth_environment=${environment}`, "Sec-Fetch-Mode": "navigate" },
      })
      const portal = environmentConfig(environment).portalUrl
      const target = destination.startsWith("?to=create-org") ? new URL("/organizations/create", portal).href : new URL(portal).href
      expect(response.status()).toBe(303)
      expect(response.headers().location).toBe(target)
      expectHardened(response)
      expect(await response.text()).toBe("")
    })
  }
}

for (const cookie of ["", "onehealth_environment=bogus", "__Host-pp_s=expired; onehealth_environment=prod"]) {
  test(`handoff invalid or missing session uses the safe prod fallback (${cookie || "none"})`, async ({ request }) => {
    const response = await request.get(`${ROUTE}?to=create-org&env=demo`, {
      maxRedirects: 0, headers: { cookie, referer: environmentConfig("demo").portalUrl },
    })
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe(new URL("/organizations/create", environmentConfig("prod").portalUrl).href)
    expectHardened(response)
  })
}

test("handoff reads the sealed session before remembered/query/header hints without changing the session", async ({ request }) => {
  const session = await sealedSessionCookie()
  const cookie = `${session.name}=${session.value}; onehealth_environment=prod`
  for (const query of ["?to=tenant&tenantId=42&env=prod", "?to=create-org&env=prod"]) {
    const response = await request.get(`${ROUTE}${query}`, {
      maxRedirects: 0, headers: { cookie, referer: environmentConfig("prod").portalUrl },
    })
    const portal = environmentConfig("demo").portalUrl
    expect(response.status()).toBe(303)
    expect(response.headers().location).toBe(query.startsWith("?to=create-org") ? new URL("/organizations/create", portal).href : new URL(portal).href)
    expectHardened(response)
  }
})

for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
  test(`handoff ${method} is an explicit hardened 405 without a redirect`, async ({ request }) => {
    const response = await request.fetch(`${ROUTE}?to=create-org`, { method, maxRedirects: 0 })
    expect(response.status()).toBe(405)
    expect(response.headers().location).toBeUndefined()
    expectHardened(response)
    if (method === "HEAD") expect(await response.text()).toBe("")
    else expect(await response.json()).toEqual({ errorCode: "METHOD_NOT_ALLOWED", source: "proxy" })
  })
}

for (const [name, base] of [["Account", ACCOUNT_DISABLED_URL], ["App", PP_DISABLED_URL]] as const) {
  for (const method of ["GET", "POST", "HEAD"]) {
    test(`${name}-disabled handoff ${method}: existing 503 screen precedes routing, auth and redirects`, async ({ request }) => {
      const response = await request.fetch(`${base}${ROUTE}?to=create-org`, { method, maxRedirects: 0 })
      expect(response.status()).toBe(503)
      expect(response.headers().location).toBeUndefined()
      expect(response.headers()["retry-after"]).toBe("300")
      expect(response.headers()["content-type"]).toContain("text/html")
      expectHardened(response)
    })
  }
}
