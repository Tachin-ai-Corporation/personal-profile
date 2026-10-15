import { expect, type APIResponse } from "@playwright/test"
import { mockProfileDefaults, signIn, test } from "./fixtures"

/**
 * AD-21 / AD-18 headers. The fail-fast `test` (spec F7-1) runs every case, so
 * a signed-in page never lets a data call through to 1health (spec R5-1).
 */

const CSP = /^default-src 'self'; script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests$/

function expectSecurityHeaders(response: APIResponse): string {
  const headers = response.headers()
  const match = CSP.exec(headers["content-security-policy"] ?? "")
  expect(match, `CSP on ${response.url()}`).not.toBeNull()
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains")
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["referrer-policy"]).toBe("no-referrer")
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()")
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin")
  return match?.[1] ?? ""
}

test.describe("AD-21 security headers", () => {
  for (const path of ["/", "/auth", "/account", "/handoff/portal", "/no-such-page", "/favicon.png", "/api/1h/v2/user/myself"]) {
    test(`are present on ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expectSecurityHeaders(response)
    })
  }

  test("are present on a /_next/static asset", async ({ request }) => {
    const html = await (await request.get("/auth")).text()
    const asset = /\/_next\/static\/[^"']+\.js/.exec(html)?.[0]
    expect(asset).toBeTruthy()
    const response = await request.get(asset ?? "")
    expect(response.status()).toBe(200)
    expectSecurityHeaders(response)
  })

  // AD-18 (Stories 7.2, 7.3; F6-1): root proxy.ts sends the exact NO_STORE_HEADERS on the pages and /handoff/**.
  // Next 16 keeps Cache-Control and Pragma on a rendered page, but replaces Vary with its RSC list, and a 404
  // (`/account`, `/handoff/portal` until Stories 7.1 and 7.3 add them) gets Next's own, stricter no-store value.
  const NEXT_NOT_FOUND_NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate"

  for (const path of ["/", "/?tab=insurance"]) {
    test(`${path} answers the exact no-store set (AD-18)`, async ({ page }) => {
      await mockProfileDefaults(page)
      await signIn(page)
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      const headers = (await response?.allHeaders()) ?? {}
      expect(headers["cache-control"]).toBe("private, no-store, max-age=0")
      expect(headers["pragma"]).toBe("no-cache")
    })
  }

  for (const path of ["/", "/account", "/account?tab=provider", "/handoff/portal", "/handoff/portal?to=create-org"]) {
    test(`${path} without a session is never cached (AD-18)`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(["private, no-store, max-age=0", NEXT_NOT_FOUND_NO_STORE]).toContain(response.headers()["cache-control"])
      expect(response.headers()["pragma"]).toBe("no-cache")
    })
  }

  test("/auth is never cached either (force-dynamic)", async ({ request }) => {
    const cacheControl = (await request.get("/auth")).headers()["cache-control"] ?? ""
    expect(cacheControl).toContain("no-store")
    expect(cacheControl).not.toMatch(/public|s-maxage/)
  })

  test("signed-in /: the CSP nonce reaches every script, no CSP violation and no page error at runtime", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(String(error)))
    await page.addInitScript(() => {
      const store = window as unknown as { __cspViolations: string[] }
      store.__cspViolations = []
      document.addEventListener("securitypolicyviolation", (event) => {
        store.__cspViolations.push(`${event.violatedDirective} (${event.blockedURI}) ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`)
      })
    })
    await mockProfileDefaults(page)
    await signIn(page)
    const response = await page.goto("/", { waitUntil: "load" })
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(response?.headers()["content-security-policy"] ?? "")?.[1]
    expect(nonce).toBeTruthy()
    const scriptNonces = await page.evaluate(() => Array.from(document.querySelectorAll("script"), (script) => script.nonce).filter((value) => value !== ""))
    expect(scriptNonces.length).toBeGreaterThan(0)
    for (const value of scriptNonces) expect(value).toBe(nonce)
    expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([])
    expect(errors).toEqual([])
  })

  test("two requests get different nonces", async ({ request }) => {
    const first = expectSecurityHeaders(await request.get("/auth"))
    const second = expectSecurityHeaders(await request.get("/auth"))
    expect(first).not.toBe(second)
  })

  test("every script on the page carries the request nonce", async ({ request }) => {
    const response = await request.get("/auth")
    const nonce = expectSecurityHeaders(response)
    const scripts = (await response.text()).match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`)
  })

  test("/api/token carries the headers and answers 405 to anything but POST", async ({ request }) => {
    const response = await request.get("/api/token")
    expect(response.status()).toBe(405)
    expectSecurityHeaders(response)
  })

  test("POST /api/token errors (400 and 415) carry AD-21 + no-store + nosniff and never a session", async ({ request }) => {
    const invalid = await request.post("/api/token", { data: { lpl: "not-a-valid-payload" } })
    expect(invalid.status()).toBe(400)
    expect(await invalid.json()).toMatchObject({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", retryable: false })
    const wrongType = await request.post("/api/token", { headers: { "Content-Type": "text/plain" }, data: "lpl=x" })
    expect(wrongType.status()).toBe(415)
    expect(await wrongType.json()).toMatchObject({ ok: false, errorCode: "UNSUPPORTED_MEDIA", retryable: false })
    for (const response of [invalid, wrongType]) {
      expectSecurityHeaders(response)
      expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0")
      expect(response.headers()["pragma"]).toBe("no-cache")
      expect(response.headers()["set-cookie"]).toMatch(/^__Host-pp_s=; .*Max-Age=0/)
    }
  })

  test("the proxy answers no-store BFF errors", async ({ request }) => {
    const response = await request.get("/api/1h/v2/user/myself")
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0")
    expect(response.headers()["pragma"]).toBe("no-cache")
    expect(response.headers()["x-content-type-options"]).toBe("nosniff")
    expectSecurityHeaders(response)
    // Next appends its own RSC values to Vary; Cookie must be among them.
    expect(response.headers()["vary"]).toMatch(/(^|,\s*)Cookie(,|$)/)
  })

  test("the ping answers 401 SESSION_EXPIRED without a session, no-store and nosniff (no CSRF check, D5)", async ({ request }) => {
    const response = await request.post("/api/session/ping")
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ errorCode: "SESSION_EXPIRED", source: "proxy" })
    expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0")
    expectSecurityHeaders(response)
    expect((await request.get("/api/session/ping")).status()).toBe(405)
  })
})
