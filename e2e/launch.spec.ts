import { expect, type APIResponse, type Page } from "@playwright/test"
import { environmentConfig } from "../lib/shared/environments"
import { ANN, freshCode, launch, makeLpl, mockProfileDefaults, test } from "./fixtures"

/**
 * Story 1.2 launch (D1, D2, D9) end to end against the server-side upstream
 * mock (`PP_E2E_MOCK=1`, `test/e2e-upstream-mock.ts`; spec R5-1, ported from
 * main): the portal opens `/auth?lpl=…`, the client POSTs `{ lpl }` to the
 * real `/api/token`, which exchanges the code with the mock, checks `myself`
 * and seals a real `__Host-pp_s`. Every test uses the fail-fast `test` and
 * `mockProfileDefaults` for the page's own reads; the server-side calls never
 * leave the e2e server.
 */

const DEMO_PORTAL = environmentConfig("demo").portalUrl
const PROD_PORTAL = environmentConfig("prod").portalUrl
const SESSION_COOKIE = "__Host-pp_s"
const LAND = /\/\?tab=contacts$/

/** Counts the browser's `POST /api/token` requests. */
function countTokenPosts(page: Page): () => number {
  let count = 0
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/token") count += 1
  })
  return () => count
}

async function cookieNamed(page: Page, name: string) {
  return (await page.context().cookies()).find((cookie) => cookie.name === name)
}

/**
 * Records CSP violations and page errors of every document the page loads
 * (`/auth`, the hand-off, `/`, reloads), into this test's arrays: an exposed
 * binding survives navigations, a `window` store would not.
 */
async function watchPageHealth(page: Page): Promise<{ errors: string[]; violations: string[] }> {
  const errors: string[] = []
  const violations: string[] = []
  page.on("pageerror", (error) => errors.push(String(error)))
  await page.exposeFunction("__reportCspViolation", (entry: string) => violations.push(entry))
  await page.addInitScript(() => {
    const report = (window as unknown as { __reportCspViolation: (entry: string) => void }).__reportCspViolation
    document.addEventListener("securitypolicyviolation", (event) => {
      report(`${location.pathname}: ${event.violatedDirective} (${event.blockedURI}) ${event.sourceFile}:${event.lineNumber}`)
    })
  })
  return { errors, violations }
}

function expectNoStore(response: APIResponse): void {
  expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0")
  expect(response.headers()["pragma"]).toBe("no-cache")
}

test.beforeEach(async ({ page }) => {
  await mockProfileDefaults(page)
})

test("a demo launch lands on / signed in: real cookies, no lpl in the URL or history, a reload makes no second exchange", async ({ page }) => {
  const health = await watchPageHealth(page)
  const posts = countTokenPosts(page)
  const tokenResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/token")

  await page.goto(`/auth?lpl=${encodeURIComponent(makeLpl(freshCode(), "demo"))}`)
  const token = await tokenResponse
  expect(token.status()).toBe(200)
  expect(await token.json()).toEqual({ ok: true, environment: "demo" })
  // The real Set-Cookie attributes (D10): first-party Lax session cookie, no Max-Age/Expires/Domain/Partitioned.
  const setCookies = (await token.headerValues("set-cookie")).flatMap((value) => value.split("\n"))
  const session = setCookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`)) ?? ""
  expect(session).toMatch(new RegExp(`^${SESSION_COOKIE}=[^;]+; Path=/; HttpOnly; Secure; SameSite=Lax$`))
  expect(setCookies).toContain("onehealth_environment=demo; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000")

  await expect(page).toHaveURL(LAND, { timeout: 15_000 })
  expect(page.url()).not.toContain("lpl")
  await expect(page.getByRole("heading", { level: 1, name: `${ANN.firstName} ${ANN.lastName}` })).toBeVisible()
  await expect(page.getByRole("link", { name: "Return to 1health" })).toHaveAttribute("href", DEMO_PORTAL)
  expect((await cookieNamed(page, "onehealth_environment"))?.value).toBe("demo")
  expect(await cookieNamed(page, SESSION_COOKIE)).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/", expires: -1 })
  expect(posts()).toBe(1)
  // Before any reload: /auth, the launch and the hand-off to / ran without a CSP violation or a page error.
  expect(await page.evaluate(() => typeof (window as unknown as { __reportCspViolation?: unknown }).__reportCspViolation), "the reporter is wired").toBe("function")
  expect(health.violations).toEqual([])
  expect(health.errors).toEqual([])

  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: `${ANN.firstName} ${ANN.lastName}` })).toBeVisible()
  expect(posts(), "a reload performs no second exchange").toBe(1)
  expect(health.violations).toEqual([])

  // History: the previous entry is the stripped /auth, which does not re-launch.
  await page.goBack()
  await expect(page).toHaveURL(/\/auth$/)
  await expect(page.getByText("Connected to Demo environment. No launch payload detected.")).toBeVisible()
  expect(posts()).toBe(1)
  expect(health.violations).toEqual([])
  expect(health.errors).toEqual([])
})

test("a prod launch seals prod: the prod portal link and the remembered environment", async ({ page }) => {
  await launch(page, "prod")
  expect((await cookieNamed(page, "onehealth_environment"))?.value).toBe("prod")
  await expect(page.getByRole("link", { name: "Return to 1health" })).toHaveAttribute("href", PROD_PORTAL)
})

test("an unencoded lpl whose '+' arrives as a space still launches", async ({ page }) => {
  let lpl = makeLpl(freshCode())
  while (!lpl.includes("+")) lpl = makeLpl(freshCode())
  // Only '/' and '=' are encoded; '+' stays raw and reaches the page as a space.
  await page.goto(`/auth?lpl=${lpl.replace(/\//g, "%2F").replace(/=/g, "%3D")}`)
  await expect(page).toHaveURL(LAND, { timeout: 15_000 })
})

test("a replayed one-time code: five POSTs, then the error, and the previous session is cleared", async ({ page }) => {
  test.slow()
  const lpl = makeLpl(freshCode())
  await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
  await expect(page).toHaveURL(LAND, { timeout: 15_000 })
  expect(await cookieNamed(page, SESSION_COOKIE)).toBeDefined()

  const posts = countTokenPosts(page)
  await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
  const alert = page.getByRole("alert").filter({ hasText: "Authentication Failed" })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(alert).toContainText("This link has expired. Open Personal Profile again from 1health.")
  expect(posts()).toBe(5)
  expect(await cookieNamed(page, SESSION_COOKIE)).toBeUndefined()
  await page.goto("/")
  await expect(page).toHaveURL(/\/auth$/)
})

test("manual entry launches with a pasted, padded payload", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "onehealth_environment", value: "demo", url: baseURL ?? "", httpOnly: true, secure: true, sameSite: "Lax" }])
  await page.goto("/auth")
  await expect(page.getByText("Connected to Demo environment. No launch payload detected.")).toBeVisible()
  const submit = page.getByRole("button", { name: "Submit" })
  await expect(submit).toBeDisabled()
  await page.getByLabel("Launch Payload (LPL)").fill(`  ${makeLpl(freshCode())}  `)
  await submit.click()
  await expect(page).toHaveURL(LAND, { timeout: 15_000 })
  await expect(page.getByRole("heading", { level: 1, name: `${ANN.firstName} ${ANN.lastName}` })).toBeVisible()
})

test("an unmocked myself read goes through the real proxy with the sealed session", async ({ page }) => {
  await launch(page)
  // page.request shares the context's cookies but not its routes: this reaches the real /api/1h proxy.
  const response = await page.request.get("/api/1h/v2/user/myself")
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual(ANN)
  expectNoStore(response)
  expect(response.headers()["x-content-type-options"]).toBe("nosniff")
})

test("logout with a real session: 204 clearing the cookie (Max-Age=0) after revoking the tokens on the platform", async ({ page, request }) => {
  await launch(page)
  const sealed = (await cookieNamed(page, SESSION_COOKIE))?.value ?? ""
  expect(sealed).not.toBe("")
  const withOldCookie = () => request.get("/api/1h/v2/user/myself", { headers: { cookie: `${SESSION_COOKIE}=${sealed}` } })
  expect((await withOldCookie()).status()).toBe(200)

  const logout = await page.request.post("/api/session/logout")
  expect(logout.status()).toBe(204)
  const cleared = logout.headers()["set-cookie"] ?? ""
  expect(cleared).toContain(`${SESSION_COOKIE}=;`)
  expect(cleared).toContain("Max-Age=0")
  expectNoStore(logout)

  // The revoke reached the platform: the mock now refuses the old access token, so even a replayed old cookie is dead.
  const replayed = await withOldCookie()
  expect(replayed.status()).toBe(401)
  expect(await replayed.json()).toEqual({ errorCode: "TOKEN_EXPIRED", source: "proxy" })
  await page.goto("/")
  await expect(page).toHaveURL(/\/auth$/)
})
