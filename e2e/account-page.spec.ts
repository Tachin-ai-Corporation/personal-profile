import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { expectHeaderTabOrder, mockAccountDefaults, mockMyself, mockOrganizations, mockProfileDefaults, mockUserNpi, organizationsPage, organizationWire, setTheme, signIn, test } from "./fixtures"

/**
 * Story 7.1: the `/account` route on the real page (Team B). Every test runs
 * under the fail-fast `test` and starts from `mockAccountDefaults`, so a read a
 * Team B story adds to `/account` is answered by its default here. The dirty
 * page-switch leave guard is covered by `e2e/shell.spec.ts` "leave guard
 * (Story 1.13, fixture page)" and is not repeated here.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const TABS = [
  ["personal", "Personal Account"],
  ["provider", "Individual Provider Registration"],
  ["organizations", "My Organizations"],
] as const

const h1 = (page: Page) => page.getByRole("heading", { level: 1, name: "Ann Lee" })
const selectedTab = (page: Page) => page.getByRole("tab", { selected: true })

/** Opens `url` with the `/account` defaults and waits for the page (h1) to render. */
async function openAccount(page: Page, url: string): Promise<void> {
  await mockAccountDefaults(page)
  await page.goto(url)
  await expect(h1(page)).toBeVisible()
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** The focused element's `id` (or `body`). */
const focusedId = (page: Page) => page.evaluate(() => (document.activeElement === document.body ? "body" : (document.activeElement?.id ?? "")))

test.describe("/account with a session (Story 7.1)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  test("?tab=organizations lands on My Organizations; Account is the current page", async ({ page }) => {
    await openAccount(page, "/account?tab=organizations")
    await expect(page).toHaveURL(/\/account\?tab=organizations$/)
    await expect(selectedTab(page)).toHaveText("My Organizations")
    await expect(page.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    await expect(page.getByRole("link", { name: "Personal Profile" })).not.toHaveAttribute("aria-current", "page")
  })

  test("?lpl= is ignored: the page renders and nothing calls /api/token", async ({ page }) => {
    const tokenCalls: string[] = []
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/token") tokenCalls.push(request.url())
    })
    await openAccount(page, "/account?lpl=x")
    await expect(selectedTab(page)).toHaveText("Personal Account")
    await page.waitForLoadState("networkidle")
    expect(tokenCalls).toEqual([])
  })

  test("a refresh of ?tab=provider reopens Individual Provider Registration", async ({ page }) => {
    await openAccount(page, "/account?tab=provider")
    await expect(selectedTab(page)).toHaveText("Individual Provider Registration")
    await page.reload()
    await expect(h1(page)).toBeVisible()
    await expect(page).toHaveURL(/\/account\?tab=provider$/)
    await expect(selectedTab(page)).toHaveText("Individual Provider Registration")
  })

  for (const query of ["?tab=PERSONAL", "?tab=mfa", "?tab=provider&tab=organizations", ""]) {
    test(`/account${query} opens Personal Account, normalized to ?tab=personal by replace`, async ({ page }) => {
      await mockAccountDefaults(page)
      const before = await page.evaluate(() => history.length)
      await page.goto(`/account${query}`)
      await expect(h1(page)).toBeVisible()
      await expect(page).toHaveURL(/\/account\?tab=personal$/)
      await expect(selectedTab(page)).toHaveText("Personal Account")
      // The goto adds one entry; the normalization replaces it.
      expect(await page.evaluate(() => history.length)).toBe(before + 1)
    })
  }

  for (const [hash, heading] of [
    ["account", "Personal account settings"],
    ["authenticator", "Authenticator app"],
  ] as const) {
    test(`#${hash} on load focuses the "${heading}" h2; a later hashchange follows too`, async ({ page }) => {
      await openAccount(page, `/account?tab=personal#${hash}`)
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeFocused()
      await expect(page.locator(`#${hash}`)).toBeInViewport()
      const other = hash === "account" ? "authenticator" : "account"
      await page.evaluate((target) => {
        window.location.hash = target
      }, other)
      await expect(page.locator(`#${other}-heading`)).toBeFocused()
    })
  }

  for (const url of ["/account?tab=personal#nope", "/account?tab=provider#account", "/account?tab=organizations#authenticator"]) {
    test(`${url} stays at the top without error`, async ({ page }) => {
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(String(error)))
      await openAccount(page, url)
      await page.waitForLoadState("networkidle")
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
      expect(await focusedId(page)).toBe("body")
      expect(errors).toEqual([])
    })
  }

  test("page nav: / → Account lands on Personal Account with aria-current and no second myself request", async ({ page }) => {
    await mockProfileDefaults(page)
    await mockAccountDefaults(page)
    const myselfCalls = await mockMyself(page)
    await page.goto("/")
    await expect(h1(page)).toBeVisible()
    await page.getByRole("link", { name: "Account" }).click()
    await expect(page).toHaveURL(/\/account\?tab=personal$/)
    await expect(selectedTab(page)).toHaveText("Personal Account")
    await expect(page.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    await expect(h1(page)).toBeVisible()
    // A client navigation inside one SWR cache: the fresh myself is reused, the document not reloaded.
    expect(myselfCalls()).toBe(1)
  })

  test("Account while on /account does nothing: no navigation, no history entry, no request", async ({ page }) => {
    await mockAccountDefaults(page)
    const myselfCalls = await mockMyself(page)
    await page.goto("/account?tab=provider")
    await expect(h1(page)).toBeVisible()
    await page.waitForLoadState("networkidle")
    const historyLength = await page.evaluate(() => history.length)
    const requests: string[] = []
    page.on("request", (request) => requests.push(request.url()))
    await page.getByRole("link", { name: "Account" }).click()
    // Give a late client navigation or prefetch time to start before asserting none did.
    await page.waitForTimeout(750)
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/account\?tab=provider$/)
    await expect(selectedTab(page)).toHaveText("Individual Provider Registration")
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
    expect(requests).toEqual([])
    expect(myselfCalls()).toBe(1)
  })

  test("tab order: app bar → header (no avatar stop) → the selected tab; the wordmark is never focused", async ({ page }) => {
    await openAccount(page, "/account?tab=personal")
    await expectHeaderTabOrder(page)
  })

  for (const [tab, label] of TABS) {
    test(`?tab=${tab}: axe clean in light and dark, no horizontal scroll, 44 px targets`, async ({ page }) => {
      await openAccount(page, `/account?tab=${tab}`)
      await expect(selectedTab(page)).toHaveText(label)
      await expectNoHorizontalScroll(page)
      const targets = [
        page.getByRole("link", { name: "Personal Profile" }),
        page.getByRole("link", { name: "Account" }),
        page.getByRole("link", { name: "Return to 1health" }),
        ...(await page.getByRole("tab").all()),
      ]
      for (const target of targets) {
        const box = await target.boundingBox()
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
      }
      await expectNoAxeViolations(page, `/account?tab=${tab}`)
    })
  }
})

test.describe("/account read failures in one flow (Story 7.1 deferred page e2e)", () => {
  const LOAD_ERROR = "Something went wrong while loading profile information"

  test("myself failure claimed by Sections vs the page banner, per-frame Retry, then session expiry", async ({ page }) => {
    await signIn(page)
    await mockAccountDefaults(page)
    // A 400 avoids myself's transient 5xx retry budget (foundation-tested); the orgs read never auto-retries.
    const failedMyself = await mockMyself(page, { status: 400, body: { message: "Private upstream diagnostic", code: 400 } })
    const failedOrgs = await mockOrganizations(page, { status: 500, body: { message: "Private upstream diagnostic", code: 500 } })
    await page.goto("/account?tab=personal")
    const main = page.getByRole("main")
    const panel = page.getByRole("tabpanel")
    const account = page.getByRole("region", { name: "Personal account settings", exact: true })
    const authenticator = page.getByRole("region", { name: "Authenticator app", exact: true })

    // 1. Personal Account: both Sections claim the myself failure, each with its own Retry; no page banner.
    for (const section of [account, authenticator]) {
      await expect(section.getByText(LOAD_ERROR, { exact: true })).toBeVisible()
      await expect(section.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
    }
    await expect(main.getByText(LOAD_ERROR, { exact: true })).toHaveCount(2)
    await expect(page.getByText("Private upstream diagnostic")).toHaveCount(0)
    expect(failedMyself()).toBe(1)

    // 2. My Organizations: no Section claims myself, so the page banner shows it; the tab's own read fails in its frame.
    await page.getByRole("tab", { name: "My Organizations" }).click()
    await expect(panel.getByText(LOAD_ERROR, { exact: true })).toBeVisible()
    await expect(main.getByText(LOAD_ERROR, { exact: true })).toHaveCount(2)
    await expect(main.getByRole("button", { name: "Retry", exact: true })).toHaveCount(2)
    expect(failedOrgs()).toHaveLength(1)

    // 3. The tab frame's Retry recovers only its own read; the myself banner stays.
    const orgs = await mockOrganizations(page, { body: organizationsPage([organizationWire()]) })
    const myselfAfterOrgsRetry = await mockMyself(page, { status: 400, body: { message: "Private upstream diagnostic", code: 400 } })
    await panel.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(panel.getByRole("heading", { name: "Sample Organization", exact: true })).toBeVisible()
    await expect(panel.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
    await expect(main.getByText(LOAD_ERROR, { exact: true })).toHaveCount(1)
    expect(orgs()).toHaveLength(1)
    expect(myselfAfterOrgsRetry()).toBe(0)

    // 4. The page banner's Retry recovers myself; the banner goes away and the header names the user.
    const recovered = await mockMyself(page)
    await main.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(h1(page)).toBeVisible()
    await expect(main.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
    expect(recovered()).toBe(1)

    // 5. A read that finds the session expired opens the session dialog instead of a frame error or Retry.
    await mockUserNpi(page, { status: 401, body: { errorCode: "SESSION_EXPIRED", source: "proxy" } })
    await page.getByRole("tab", { name: "Individual Provider Registration" }).click()
    const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Return to 1health" })).toBeFocused()
    await expect(main.getByText(LOAD_ERROR, { exact: true })).toHaveCount(0)
    await expect(main.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem("pp:login-intent"))).toBe("/account?tab=provider")
  })
})

test.describe("/account without a session (Story 7.1)", () => {
  test("?tab=organizations redirects to the /auth no-LPL screen", async ({ page }) => {
    await page.goto("/account?tab=organizations")
    await expect(page).toHaveURL(/\/auth$/)
    await expect(page.getByText("Choose Environment")).toBeVisible()
  })

  test("?lpl=x redirects to /auth with no query (the lpl is dropped, no exchange)", async ({ page }) => {
    const tokenCalls: string[] = []
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/token") tokenCalls.push(request.url())
    })
    await page.goto("/account?lpl=x")
    await expect(page).toHaveURL(/\/auth$/)
    expect(new URL(page.url()).search).toBe("")
    await expect(page.getByText("Choose Environment")).toBeVisible()
    expect(tokenCalls).toEqual([])
  })
})
