import { expect, test } from "@playwright/test"

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
