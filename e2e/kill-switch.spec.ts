import AxeBuilder from "@axe-core/playwright"
import { expect, test, type APIResponse } from "@playwright/test"
import { computeCacheBustingSearchParam } from "next/dist/shared/lib/router/utils/cache-busting-search-param"
import { environmentConfig } from "../lib/shared/environments"
import { ACCOUNT_DISABLED_URL, PP_DISABLED_URL } from "./server-env"

/**
 * Kill switches end to end (AD-20, Stories 1.16 and 7.2), against the same
 * production build started with `PP_DISABLED=1` / `ACCOUNT_DISABLED=1`
 * (playwright.config.ts). Next 16 keeps the 503 only because root `proxy.ts`
 * rewrites switched-off pages to the `/disabled` route handler.
 */

const DEMO_PORTAL = environmentConfig("demo").portalUrl
const PROD_PORTAL = environmentConfig("prod").portalUrl
const SERVICE_DISABLED = { errorCode: "SERVICE_DISABLED", source: "proxy" }

function expectHardened(response: APIResponse): void {
  const headers = response.headers()
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["referrer-policy"]).toBe("no-referrer")
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin")
  expect(headers["cache-control"]).toBe("private, no-store, max-age=0")
}

async function expectDisabledScreen(response: APIResponse, portalUrl: string): Promise<void> {
  expect(response.status()).toBe(503)
  expect(response.headers()["content-type"]).toBe("text/html; charset=utf-8")
  expectHardened(response)
  const html = await response.text()
  expect(html).toContain("Personal Profile is unavailable right now")
  expect(html).toContain(`href="${portalUrl}"`)
  expect(html).not.toMatch(/<script/i)
}

test.describe("PP_DISABLED=1", () => {
  test.use({ baseURL: PP_DISABLED_URL })

  test("a navigation to / renders the disabled screen with status 503, no redirect, axe-clean", async ({ page }) => {
    const response = await page.goto("/")
    expect(response?.status()).toBe(503)
    expect(page.url()).toBe(`${PP_DISABLED_URL}/`)
    await expect(page.getByRole("heading", { level: 1, name: "Personal Profile is unavailable right now" })).toBeVisible()
    await expect(page.getByText("Use your profile in 1health for now.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Go to 1health" })).toHaveAttribute("href", PROD_PORTAL)
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
    expect(results.violations).toEqual([])
  })

  for (const path of ["/", "/auth", "/auth?lpl=abc", "/account", "/handoff/portal?to=create-org"]) {
    test(`${path} answers the 503 screen with AD-21 and no-store headers`, async ({ request }) => {
      await expectDisabledScreen(await request.get(path, { maxRedirects: 0 }), PROD_PORTAL)
    })
  }

  for (const [label, prefetch] of [
    ["an RSC navigation", undefined],
    ["an RSC prefetch", "1"],
  ] as const) {
    test(`${label} is switched off too`, async ({ request }) => {
      // A real client request: Next answers 307 to an RSC request whose `_rsc` does not match its headers.
      const tree = encodeURIComponent(JSON.stringify([""]))
      const rsc = await computeCacheBustingSearchParam(prefetch, undefined, tree, undefined)
      const headers: Record<string, string> = { RSC: "1", "Next-Router-State-Tree": tree, ...(prefetch ? { "Next-Router-Prefetch": prefetch } : {}) }
      const response = await request.get(`/account?_rsc=${rsc}`, { headers, maxRedirects: 0 })
      expect(response.status()).toBe(503)
      expectHardened(response)
    })
  }

  test("the link follows the remembered environment, then the referrer on /auth", async ({ request }) => {
    await expectDisabledScreen(await request.get("/", { headers: { cookie: "onehealth_environment=demo" } }), DEMO_PORTAL)
    await expectDisabledScreen(await request.get("/auth", { headers: { referer: `${DEMO_PORTAL}/apps` } }), DEMO_PORTAL)
    await expectDisabledScreen(await request.get("/", { headers: { referer: `${DEMO_PORTAL}/apps` } }), PROD_PORTAL)
  })

  for (const [method, path] of [
    ["GET", "/api/1h/v2/user/myself"],
    ["GET", "/api/pp/profile-picture-id"],
    ["POST", "/api/pp/mfa/validate"],
    ["GET", "/api/pp/org-logo/1"],
    ["POST", "/api/places/autocomplete"],
    ["POST", "/api/session/refresh"],
    ["POST", "/api/session/ping"],
  ] as const) {
    test(`${method} ${path} → 503 SERVICE_DISABLED`, async ({ request }) => {
      const response = await request.fetch(path, { method })
      expect(response.status()).toBe(503)
      expect(await response.json()).toEqual(SERVICE_DISABLED)
      expectHardened(response)
    })
  }

  test("/api/token keeps its launch envelope and logout still works", async ({ request }) => {
    const token = await request.post("/api/token", { data: { lpl: "x" } })
    expect(token.status()).toBe(503)
    expect(await token.json()).toMatchObject({ ok: false, errorCode: "SERVICE_DISABLED", retryable: false })
    expect((await request.post("/api/session/logout")).status()).toBe(204)
    expect((await request.get("/api/session/logout")).status()).toBe(204)
  })
})

test.describe("ACCOUNT_DISABLED=1", () => {
  test.use({ baseURL: ACCOUNT_DISABLED_URL })

  for (const path of ["/account", "/account?tab=provider", "/handoff/portal"]) {
    test(`${path} answers the 503 screen`, async ({ request }) => {
      await expectDisabledScreen(await request.get(path, { maxRedirects: 0 }), PROD_PORTAL)
    })
  }

  for (const path of ["/api/pp/mfa/validate", "/api/pp/practice-support", "/api/pp/org-logo/1"]) {
    test(`${path} → 503 SERVICE_DISABLED`, async ({ request }) => {
      const response = await request.fetch(path, { method: path.endsWith("validate") ? "POST" : "GET" })
      expect(response.status()).toBe(503)
      expect(await response.json()).toEqual(SERVICE_DISABLED)
    })
  }

  test("Personal Profile keeps working: /auth renders, / asks for a session, its named ops need a session", async ({ request }) => {
    expect((await request.get("/auth")).status()).toBe(200)
    expect((await request.get("/", { maxRedirects: 0 })).status()).not.toBe(503)
    for (const path of ["/api/pp/profile-picture-id", "/api/1h/v2/user/myself"]) {
      const response = await request.get(path)
      expect(response.status()).toBe(401)
      expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    }
  })
})

test.describe("no switch on", () => {
  test("/disabled is 404 and the named ops need a session (401, no-store, AD-21)", async ({ request }) => {
    expect((await request.get("/disabled")).status()).toBe(404)
    for (const [method, path] of [
      ["GET", "/api/pp/profile-picture-id"],
      ["POST", "/api/pp/mfa/validate"],
      ["GET", "/api/pp/practice-support"],
      ["GET", "/api/pp/org-logo/1"],
      ["POST", "/api/places/autocomplete"],
      ["POST", "/api/places/details"],
    ] as const) {
      const response = await request.fetch(path, { method })
      expect(response.status(), path).toBe(401)
      expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
      expectHardened(response)
    }
  })

  test("named ops answer 405 to other methods, HEAD included", async ({ request }) => {
    expect((await request.post("/api/pp/profile-picture-id")).status()).toBe(405)
    expect((await request.head("/api/pp/org-logo/1")).status()).toBe(405)
    expect((await request.get("/api/places/details")).status()).toBe(405)
  })
})
