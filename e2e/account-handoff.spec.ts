import { expect, type APIResponse } from "@playwright/test"
import { sealData, unsealData } from "iron-session"
import type { SessionPayload } from "../lib/server/session/types"
import { environmentConfig } from "../lib/shared/environments"
import { ACCOUNT_DISABLED_URL, PP_DISABLED_URL, TEST_SERVER_ENV } from "./server-env"
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

for (const { label, cookie } of [
  { label: "missing session and remembered environment", cookie: "" },
  { label: "invalid remembered environment", cookie: "onehealth_environment=bogus" },
  { label: "invalid session seal with remembered prod", cookie: "__Host-pp_s=invalid-seal; onehealth_environment=prod" },
]) {
  test(`handoff ${label} uses the safe prod fallback`, async ({ request }) => {
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

for (const expiry of ["idle", "absolute", "access"] as const) {
  test(`handoff ${expiry}-expired sealed demo session overrides remembered prod without renewal or logout`, async ({ request }) => {
    const session = await sealedSessionCookie()
    const sealOptions = { password: TEST_SERVER_ENV.SESSION_SECRET, ttl: 8 * 60 * 60 }
    const fresh = await unsealData<SessionPayload>(session.value, sealOptions)
    const now = Date.now()
    const payload = {
      ...fresh,
      ...(expiry === "idle" ? { iat: now - 20 * 60_000, lastSeen: now - 16 * 60_000 } : {}),
      ...(expiry === "absolute" ? { iat: now - 9 * 60 * 60_000 } : {}),
      ...(expiry === "access" ? { accessExpiresAt: now - 60_000 } : {}),
    }
    // Age the payload, not the cryptographic seal: it must still be readable.
    const seal = await sealData(payload, sealOptions)
    expect(await unsealData<SessionPayload>(seal, sealOptions)).toEqual(payload)
    expect(payload.environment).toBe("demo")
    if (expiry === "idle") expect(now - payload.lastSeen).toBeGreaterThan(15 * 60_000)
    if (expiry === "absolute") expect(now - payload.iat).toBeGreaterThan(8 * 60 * 60_000)
    if (expiry === "access") expect(payload.accessExpiresAt).toBeLessThan(now)

    // Only local HTTP requests; the production server uses TEST_SERVER_ENV's upstream mock.
    for (const query of ["?to=tenant&tenantId=42&env=prod", "?to=create-org&env=prod"]) {
      const response = await request.get(`${ROUTE}${query}`, {
        maxRedirects: 0,
        headers: {
          cookie: `${session.name}=${seal}; onehealth_environment=prod`,
          referer: environmentConfig("prod").portalUrl,
          "Sec-Fetch-Mode": "navigate",
        },
      })
      const portal = environmentConfig("demo").portalUrl
      // The exact 303 rules out an interceptor auth/logout redirect.
      expect(response.status()).toBe(303)
      expect(response.headers().location).toBe(query.startsWith("?to=create-org") ? new URL("/organizations/create", portal).href : new URL(portal).href)
      expectHardened(response)
      expect(await response.text()).toBe("")
      // No Set-Cookie means no renewal/clearing; the retained seal preserves all fields,
      // including lastSeen, token expiry, refresh generation and session identity.
      expect(response.headers()["set-cookie"]).toBeUndefined()
      expect(await unsealData<SessionPayload>(seal, sealOptions)).toEqual(payload)
    }
  })
}

for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
  test(`handoff ${method} is an explicit hardened 405 without a redirect`, async ({ request }) => {
    const response = await request.fetch(`${ROUTE}?to=create-org`, { method, maxRedirects: 0 })
    expect(response.status()).toBe(405)
    expect(response.headers().allow).toBe("GET")
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
