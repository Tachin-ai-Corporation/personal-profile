import { expect, test } from "@playwright/test"
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * AD-4 launch redirect chain, against the server-side upstream mock
 * (`PP_E2E_MOCK=1`, see `test/e2e-upstream-mock.ts`).
 *
 * Asserts the full chain lands on `/?tab=contacts#signature` with the fragment
 * intact and `lpl` stripped from the final URL, and that the one-time code is
 * single-use (a re-launch with the same lpl → `reason=used`, proving no retry /
 * no second exchange).
 *
 * The webServer runs with the dummy secret/app-id below, so the fixture lpl is
 * built to decrypt against them.
 */

const SECRET = "dummy-onehealth-secret"
const APP_ID = "dummy-app-id"
const USER_ID = 42 // must match the mock `/myself` id

/** Build a valid base64 lpl: base64( IV(12) ++ AES-256-GCM ciphertext ++ tag(16) ). */
function makeLpl(code: string): string {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(SECRET, "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32))
  const payload = JSON.stringify({
    required: {
      apiKey: { name: APP_ID },
      tenant: { id: 1 },
      user: { id: USER_ID },
      externalApplicationId: { id: 1 },
      oneTimeCode: { value: code, issuedAt: "2026-10-13T00:00:00" },
    },
  })
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString("base64")
}

/** A fresh, unique one-time code per test (the mock tracks consumed codes for the run). */
function freshCode(): string {
  return `code-${randomBytes(8).toString("hex")}`
}

test("valid launch lands on /?tab=contacts#signature, lpl stripped, signed in", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (err) => pageErrors.push(String(err)))
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.violatedDirective} (${e.blockedURI})`)
    })
  })

  const lpl = makeLpl(freshCode())
  // The returned response is the final `/` document after the redirect chain.
  const response = await page.goto(`/launch?lpl=${encodeURIComponent(lpl)}&tab=contacts#signature`, {
    waitUntil: "load",
  })

  await expect(page).toHaveURL(/\/\?tab=contacts#signature$/)
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByRole("heading", { name: /personal profile/i })).toBeVisible()
  // The name comes from an in-app `callApi` through the real proxy, so the page's
  // embedded X-PP-Session binding round-tripped (AD-17, AD-19).
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()

  // The signed-in `/` page's CSP nonce must reach its rendered scripts (strict-dynamic),
  // and nothing must trip the policy.
  const csp = response?.headers()["content-security-policy"] ?? ""
  const headerNonce = csp.match(/'nonce-([A-Za-z0-9+/=]{16,})'/)?.[1]
  expect(headerNonce, "the / response carries a CSP nonce").toBeTruthy()

  const scriptNonces = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .map((s) => s.nonce)
      .filter((n): n is string => n.length > 0),
  )
  expect(scriptNonces.length, "at least one rendered script carries a nonce").toBeGreaterThan(0)
  for (const nonce of scriptNonces) {
    expect(nonce).toBe(headerNonce)
  }

  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  )
  expect(violations, "no CSP violations during load").toEqual([])
  expect(pageErrors, "no page errors during load").toEqual([])
})

test("the proxy entry `/?lpl=` is redirected through launch and keeps the fragment", async ({ page }) => {
  const lpl = makeLpl(freshCode())
  await page.goto(`/?lpl=${encodeURIComponent(lpl)}&tab=contacts#signature`)

  await expect(page).toHaveURL(/\/\?tab=contacts#signature$/)
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByRole("heading", { name: /personal profile/i })).toBeVisible()
})

test("reloading the final URL stays signed in and does not re-launch", async ({ page }) => {
  const lpl = makeLpl(freshCode())
  await page.goto(`/launch?lpl=${encodeURIComponent(lpl)}&tab=contacts`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)

  await page.reload()
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByRole("heading", { name: /personal profile/i })).toBeVisible()
})

test("the one-time code is single-use: re-launching the same lpl shows reason=used", async ({ page }) => {
  const lpl = makeLpl(freshCode())

  // First launch succeeds.
  await page.goto(`/launch?lpl=${encodeURIComponent(lpl)}&tab=contacts`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)

  // Re-exchanging the SAME code hits the "already redeemed" branch — no retry.
  await page.goto(`/launch?lpl=${encodeURIComponent(lpl)}&tab=contacts`)
  await expect(page).toHaveURL(/\/launch-error\?reason=used$/)
  await expect(page.getByRole("heading", { name: /this link has expired/i })).toBeVisible()
})

test("a malformed lpl lands on the invalid launch-error screen", async ({ page }) => {
  await page.goto(`/launch?lpl=not-a-valid-payload&tab=contacts`)
  await expect(page).toHaveURL(/\/launch-error\?reason=invalid$/)
  await expect(page.getByRole("heading", { name: /this link has expired/i })).toBeVisible()
})
