import { expect, test, type Page } from "@playwright/test"
import { freshCode, makeLpl } from "./fixtures"

/**
 * Story 1.2 launch (D1, D2, D9) against the server-side upstream mock
 * (`PP_E2E_MOCK=1`, see `test/e2e-upstream-mock.ts`): the portal opens
 * `/auth?lpl=…`, the client POSTs `{ lpl }` to `/api/token`, and on success
 * lands on `/` signed in. The webServer boots with the dummy per-environment
 * secrets that `makeLpl` (in `./fixtures`) encrypts with.
 */

const DEMO_PORTAL = "https://1health.demo.1health.io"
const PROD_PORTAL = "https://1health.app.1health.io"

/** Count the browser's `POST /api/token` requests. */
function countTokenPosts(page: Page): { count: number } {
  const counter = { count: 0 }
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/token") counter.count++
  })
  return counter
}

async function cookieNamed(page: Page, name: string) {
  return (await page.context().cookies()).find((c) => c.name === name)
}

test("a demo launch lands on / signed in; lpl is in neither the URL nor history; reload makes no second exchange", async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on("pageerror", (err) => pageErrors.push(String(err)))
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.violatedDirective} (${e.blockedURI})`)
    })
  })
  const posts = countTokenPosts(page)

  const lpl = makeLpl(freshCode(), "demo")
  await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
  expect(posts.count).toBe(1)

  // The sealed environment is demo: the remembered environment and the
  // session-derived portal link both say so.
  expect((await cookieNamed(page, "onehealth_environment"))?.value).toBe("demo")
  await expect(page.getByRole("link", { name: "Return to 1health" })).toHaveAttribute("href", DEMO_PORTAL)

  // The session cookie is first-party Lax, httpOnly and Secure (D10).
  const session = await cookieNamed(page, "__Host-pp_s")
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/", expires: -1 })

  // Signed-in `/`: the CSP nonce reaches every script and nothing trips the policy.
  const response = await page.reload({ waitUntil: "load" })
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
  expect(posts.count, "a reload performs no second exchange").toBe(1)
  const csp = response?.headers()["content-security-policy"] ?? ""
  const headerNonce = csp.match(/'nonce-([A-Za-z0-9+/=]{16,})'/)?.[1]
  expect(headerNonce).toBeTruthy()
  const scriptNonces = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .map((s) => s.nonce)
      .filter((n): n is string => n.length > 0),
  )
  expect(scriptNonces.length).toBeGreaterThan(0)
  for (const nonce of scriptNonces) expect(nonce).toBe(headerNonce)
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([])

  // History: the previous entry is the stripped `/auth`, which does not re-launch.
  await page.goBack()
  await expect(page).toHaveURL(/\/auth$/)
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByRole("heading", { name: "Authentication Required" })).toBeVisible()
  await expect(page.getByText("Connected to Demo environment. No launch payload detected.")).toBeVisible()
  expect(posts.count).toBe(1)
  expect(pageErrors).toEqual([])
})

test("a prod launch seals prod: prod portal link and remembered environment", async ({ page }) => {
  await page.goto(`/auth?lpl=${encodeURIComponent(makeLpl(freshCode(), "prod"))}`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  expect((await cookieNamed(page, "onehealth_environment"))?.value).toBe("prod")
  await expect(page.getByRole("link", { name: "Return to 1health" })).toHaveAttribute("href", PROD_PORTAL)
})

test("an unencoded lpl whose '+' arrives as a space still launches", async ({ page }) => {
  let lpl = makeLpl(freshCode())
  while (!lpl.includes("+")) lpl = makeLpl(freshCode())
  // Only '/' and '=' are encoded; '+' stays raw and decodes as a space.
  await page.goto(`/auth?lpl=${lpl.replace(/\//g, "%2F").replace(/=/g, "%3D")}`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
})

test("a malformed lpl: one POST (retryable:false), then the Authentication Failed alert", async ({ page }) => {
  const posts = countTokenPosts(page)
  await page.goto(`/auth?lpl=not-a-valid-payload`)
  // (Next's route announcer is also an alert; pick the launch Alert.)
  const alert = page.getByRole("alert").filter({ hasText: "Authentication Failed" })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText("This link has expired. Open Personal Profile again from 1health.")
  expect(page.url()).not.toContain("lpl")
  await page.waitForTimeout(2_000)
  expect(posts.count).toBe(1)
  await expect(page.getByRole("button", { name: "Enter LPL Manually" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Switch Environment" })).toBeVisible()
  await expect(page.getByRole("link", { name: /^Go to 1health \((Demo|Production)\)$/ })).toBeVisible()
})

test("the one-time code is single-use: re-launching the same lpl retries five times, then fails", async ({ page }) => {
  test.slow()
  const lpl = makeLpl(freshCode())
  await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)

  const posts = countTokenPosts(page)
  await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
  const alert = page.getByRole("alert").filter({ hasText: "Authentication Failed" })
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await expect(alert).toContainText("This link has expired.")
  expect(posts.count).toBe(5)
  // The failed launch cleared the previous session.
  await page.goto("/")
  await expect(page).toHaveURL(/\/auth$/)
})

test("/ without a session redirects to /auth; with no known environment it shows Choose Environment", async ({ page }) => {
  await page.goto("/?tab=insurance")
  await expect(page).toHaveURL(/\/auth$/)
  await expect(page.getByRole("heading", { name: "Choose Environment" })).toBeVisible()
  await page.getByRole("button", { name: "Production" }).click()
  await expect(page.getByText("Connected to Production environment. No launch payload detected.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Go to 1health (Production)" })).toHaveAttribute("href", PROD_PORTAL)
})

test("manual entry launches with a pasted payload", async ({ page }) => {
  await page.context().addCookies([
    { name: "onehealth_environment", value: "demo", url: "http://localhost:3100", httpOnly: true, secure: true, sameSite: "Lax" },
  ])
  await page.goto("/auth")
  await expect(page.getByText("Connected to Demo environment. No launch payload detected.")).toBeVisible()
  const submit = page.getByRole("button", { name: "Submit" })
  await expect(submit).toBeDisabled()
  await page.getByLabel("Launch Payload (LPL)").fill(`  ${makeLpl(freshCode())}  `)
  await submit.click()
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
})
