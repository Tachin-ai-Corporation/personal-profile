import { expect, test } from "@playwright/test"
import { freshCode, makeLpl } from "./fixtures"

/**
 * AD-21: every response — app routes, 404s and static assets — carries the full
 * security-header set with a fresh per-request CSP nonce, `frame-ancestors` is
 * exactly the portal origin, and `X-Frame-Options` is never sent.
 *
 * The webServer runs with APP_ENV=dev, so PORTAL_ORIGIN is https://dev.1hdev.io.
 */

const PORTAL_ORIGIN = "https://dev.1hdev.io"

const TARGETS = [
  // `/` with no session redirects to the launch-error screen; follow it so we
  // assert the AD-21 header set on the page the user actually sees.
  { name: "home", path: "/", expectStatus: 200 },
  { name: "launch-error", path: "/launch-error", expectStatus: 200 },
  { name: "404 path", path: "/does-not-exist-abc123", expectStatus: 404 },
  { name: "static asset", path: "/favicon.png", expectStatus: 200 },
]

/** The exact CSP string (AD-21), with the per-request nonce as a placeholder. */
function expectedCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${PORTAL_ORIGIN}`,
    "upgrade-insecure-requests",
  ].join("; ")
}

function assertSecurityHeaders(headers: Record<string, string>) {
  const csp = headers["content-security-policy"]
  expect(csp, "CSP header present").toBeTruthy()

  // Pin the complete CSP string: extract the per-request nonce, then assert the
  // whole header equals the exact expected string with that nonce substituted.
  const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]{16,})'/)?.[1]
  expect(nonce, "CSP carries a per-request nonce").toBeTruthy()
  expect(csp).toBe(expectedCsp(nonce as string))

  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains")
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["referrer-policy"]).toBe("no-referrer")
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()")
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups")

  // AD-21 / AD-5: framing is governed by CSP alone; X-Frame-Options is never set.
  expect(headers["x-frame-options"]).toBeUndefined()
}

for (const target of TARGETS) {
  test(`${target.name} carries the full AD-21 header set`, async ({ request }) => {
    const res = await request.get(target.path)
    expect(res.status()).toBe(target.expectStatus)
    assertSecurityHeaders(res.headers())
  })
}

test("a /_next/static/* asset carries the full AD-21 header set", async ({ request }) => {
  // The matcher must reach Next's build assets too — the path class middleware
  // matchers usually exclude. Discover a real hashed asset URL from the homepage
  // rather than hardcoding a per-build filename.
  const html = await (await request.get("/")).text()
  const assetPath = html.match(/\/_next\/static\/[^"']+/)?.[0]
  expect(assetPath, "homepage references a /_next/static/* asset").toBeTruthy()

  const res = await request.get(assetPath!)
  expect(res.status()).toBe(200)
  assertSecurityHeaders(res.headers())
})

test("the response CSP nonce reaches the page scripts (strict-dynamic works)", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (err) => pageErrors.push(String(err)))

  // Record any CSP violation the browser raises while loading the page.
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.violatedDirective} (${e.blockedURI})`)
    })
  })

  // `/` guards and redirects when there is no session (Story 1.2), which would
  // destroy the init-script context; assert nonce/strict-dynamic on a page that
  // renders directly. `/launch-error` carries the same AD-21 CSP.
  const response = await page.goto("/launch-error", { waitUntil: "load" })
  const csp = response?.headers()["content-security-policy"] ?? ""
  const headerNonce = csp.match(/'nonce-([A-Za-z0-9+/=]{16,})'/)?.[1]
  expect(headerNonce, "response CSP carries a nonce").toBeTruthy()

  // Read the live nonce IDL property (the content attribute is hidden post-load).
  const scriptNonces = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .map((s) => s.nonce)
      .filter((n): n is string => n.length > 0),
  )
  expect(scriptNonces.length, "at least one rendered script carries a nonce").toBeGreaterThan(0)
  for (const nonce of scriptNonces) {
    expect(nonce, "every script nonce matches the response CSP nonce").toBe(headerNonce)
  }

  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  )
  expect(violations, "no CSP violations during load").toEqual([])
  expect(pageErrors, "no page errors during load").toEqual([])
})

/**
 * AD-2 / AD-18 / AD-21: the `/api/1h` proxy carries the AD-21 header set (from the
 * root `proxy.ts` interceptor) PLUS the no-store trio + `nosniff` (from the proxy
 * route handler) — including on error responses. The test launches to obtain a
 * real session cookie, then provokes a 409 (mismatched `X-PP-Session`) and a 403
 * (GET without `X-PP-Session` on a non-image entry) and asserts the headers on each.
 */
function assertNoStore(headers: Record<string, string>) {
  expect(headers["cache-control"]).toBe("private, no-store, max-age=0")
  expect(headers["pragma"]).toBe("no-cache")
  // The proxy sets `Vary: Cookie`; Next merges its own RSC negotiation tokens
  // onto it, so assert the Cookie directive is present rather than the exact value.
  expect(headers["vary"]).toContain("Cookie")
  expect(headers["x-content-type-options"]).toBe("nosniff")
}

test("an /api/1h error response carries AD-21 + no-store + nosniff (409 and 403)", async ({ page }) => {
  // Launch to seal a session cookie into this page's context.
  const lpl = makeLpl(freshCode())
  await page.goto(`/launch?lpl=${encodeURIComponent(lpl)}&tab=contacts`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)

  // 409 SESSION_CHANGED: a mismatched per-tab binding header.
  const mismatched = await page.request.get("/api/1h/v2/user/myself", {
    headers: { "X-PP-Session": "definitely-not-the-binding" },
  })
  expect(mismatched.status()).toBe(409)
  expect((await mismatched.json()).code).toBe("SESSION_CHANGED")
  assertSecurityHeaders(mismatched.headers())
  assertNoStore(mismatched.headers())

  // 403 CSRF: a GET without the binding header on a non-image entry.
  const noBinding = await page.request.get("/api/1h/v2/user/myself")
  expect(noBinding.status()).toBe(403)
  expect((await noBinding.json()).code).toBe("CSRF")
  assertSecurityHeaders(noBinding.headers())
  assertNoStore(noBinding.headers())
})

/**
 * AD-16 / AD-17 / AD-18: `POST /api/session/refresh` without the CSRF headers
 * (no same-origin proof, no `X-PP-Session`) → 403 `CSRF`, still carrying the
 * no-store trio + `nosniff`.
 */
test("POST /api/session/refresh without CSRF headers → 403 with no-store + nosniff", async ({ request }) => {
  const res = await request.post("/api/session/refresh")
  expect(res.status()).toBe(403)
  expect(await res.json()).toEqual({ code: "CSRF" })
  assertSecurityHeaders(res.headers())
  assertNoStore(res.headers())
})

/**
 * Story 1.6 / AD-17 / AD-18: `POST /api/session/ping` without the CSRF headers
 * → 403 `CSRF`, still carrying the no-store trio + `nosniff`, and no cookie.
 */
test("POST /api/session/ping without CSRF headers → 403 with no-store + nosniff", async ({ request }) => {
  const res = await request.post("/api/session/ping")
  expect(res.status()).toBe(403)
  expect(await res.json()).toEqual({ code: "CSRF" })
  expect(res.headers()["set-cookie"]).toBeUndefined()
  expect(res.headers()["x-pp-activity-at"]).toBeUndefined()
  assertSecurityHeaders(res.headers())
  assertNoStore(res.headers())
})

/**
 * Story 1.7 / AD-17 / AD-18: `POST /api/session/logout` without the CSRF headers
 * → 403 `CSRF`, still carrying the no-store trio + `nosniff`, and the cookie is
 * left untouched (no `Set-Cookie`).
 */
test("POST /api/session/logout without CSRF headers → 403 with no-store + nosniff", async ({ request }) => {
  const res = await request.post("/api/session/logout")
  expect(res.status()).toBe(403)
  expect(await res.json()).toEqual({ code: "CSRF" })
  expect(res.headers()["set-cookie"]).toBeUndefined()
  assertSecurityHeaders(res.headers())
  assertNoStore(res.headers())
})

test("two requests to / produce different CSP nonces", async ({ request }) => {
  const nonceOf = async () => {
    const res = await request.get("/")
    const csp = res.headers()["content-security-policy"] ?? ""
    return csp.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1]
  }
  const first = await nonceOf()
  const second = await nonceOf()
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  expect(first).not.toBe(second)
})
