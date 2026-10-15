import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page, type Route } from "@playwright/test"
import { ANN, PORTAL_URL, mockContacts, mockExit, mockMyself, setTheme, signIn } from "./fixtures"

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const FIXTURE = "/test-fixtures/section"
const KEY = `pp:draft:v1:demo:${ANN.id}:phone`
const RESTORE = "You have unsaved changes from your last visit."
const CONFLICT = "This section changed since your draft. Choose which version to keep."

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

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

const section = (page: Page) => page.getByTestId("fixture-section")
const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Phone" })
const number = (page: Page) => section(page).getByRole("textbox", { name: "Number" })
const storedDraft = (page: Page, key = KEY) => page.evaluate((name) => window.localStorage.getItem(name), key)

/**
 * UJ-5 up to the dialog: edit the fixture Section, then Save while the
 * session is gone (the PUT answers TOKEN_EXPIRED and the refresh
 * SESSION_EXPIRED); the dialog opens and "Return to 1health" leaves for the portal.
 */
async function expireWhileEditing(page: Page, value: string): Promise<void> {
  await mockExit(page)
  await page.route("**/api/1h/v2/user/edit", (route) => json(route, 401, { errorCode: "TOKEN_EXPIRED", source: "proxy" }))
  await page.route("**/api/session/refresh", (route) => json(route, 401, { errorCode: "SESSION_EXPIRED", source: "proxy" }))
  await page.emulateMedia({ reducedMotion: "reduce" })
  await section(page).getByRole("button", { name: "Edit" }).click()
  await number(page).fill(value)
  await page.getByLabel("End the session on the next save").check()
  await section(page).getByRole("button", { name: "Save" }).click()
  const dialog = page.getByRole("alertdialog", { name: "Your session ended" })
  await expect(dialog).toBeVisible()
  // Written before the dialog opened (flush on onBeforeSessionExpired), and kept by its Return.
  expect(JSON.parse((await storedDraft(page)) ?? "null")).toMatchObject({ values: { number: value, note: "" } })
  await dialog.getByRole("button", { name: "Return to 1health" }).click()
  await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
}

/** A relaunch on this device as `myself` (the draft is still in this origin's localStorage). */
async function relaunch(page: Page, myself: Record<string, unknown>): Promise<void> {
  await page.unrouteAll({ behavior: "wait" })
  await signIn(page)
  await mockMyself(page, { body: myself })
  await mockContacts(page)
  await page.goto(FIXTURE)
  await expect(heading(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockMyself(page)
  await mockContacts(page)
  await page.goto(FIXTURE)
  await expect(heading(page)).toBeVisible()
})

test.describe("Drafts across an expired session (Story 1.15, UJ-5, fixture Section)", () => {
  test("same user: the draft is written before the dialog, offered after the relaunch, restored and saved", async ({ page }) => {
    await expireWhileEditing(page, "4155550000")
    await relaunch(page, ANN)

    const banner = section(page).locator("[data-slot~='draft-restore']")
    await expect(banner.getByRole("status")).toHaveText(RESTORE)
    await expectNoAxeViolations(page, "restore banner")
    await expectNoHorizontalScroll(page)

    await banner.getByRole("button", { name: "Restore" }).click()
    await expect(number(page)).toHaveValue("4155550000")
    await expect(section(page).getByText("Unsaved changes")).toBeVisible()
    await expect(heading(page)).toBeFocused()
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Phone saved.")).toBeVisible()
    await expect(section(page).getByRole("cell", { name: "4155550000" })).toBeVisible()
    await expect.poll(() => storedDraft(page)).toBeNull()
  })

  test("server data changed: the conflict compare; Keep mine edits over the current data and saves", async ({ page }) => {
    await expireWhileEditing(page, "4155550000")
    await relaunch(page, { ...ANN, phoneNumber: "4155550199" })

    const conflict = section(page).locator("[data-slot='draft-conflict']")
    await expect(conflict.getByRole("status")).toHaveText(CONFLICT)
    await expect(section(page).getByText(RESTORE)).toHaveCount(0)
    await expect(conflict.getByText("Your version", { exact: true })).toBeVisible()
    await expect(conflict.getByText("Current", { exact: true })).toBeVisible()
    await expect(conflict.getByText("4155550000")).toBeVisible()
    await expect(conflict.getByText("4155550199")).toBeVisible()
    await expectNoAxeViolations(page, "conflict compare")
    await expectNoHorizontalScroll(page)

    await conflict.getByRole("button", { name: "Keep mine" }).click()
    await expect(number(page)).toHaveValue("4155550000")
    await expect(conflict).toHaveCount(0)
    await section(page).getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Phone saved.")).toBeVisible()
    await expect.poll(() => storedDraft(page)).toBeNull()
  })

  test("Use current drops the draft and shows the current data", async ({ page }) => {
    await expireWhileEditing(page, "4155550000")
    await relaunch(page, { ...ANN, phoneNumber: "4155550199" })
    const conflict = section(page).locator("[data-slot='draft-conflict']")
    await conflict.getByRole("button", { name: "Use current" }).click()
    await expect(conflict).toHaveCount(0)
    await expect(section(page).getByRole("cell", { name: "4155550199" })).toBeVisible()
    expect(await storedDraft(page)).toBeNull()
  })

  test("a different user: no banner, and the other user's draft is left alone", async ({ page }) => {
    await expireWhileEditing(page, "4155550000")
    await relaunch(page, { ...ANN, id: 77 })
    await expect(section(page).getByRole("cell", { name: "4155512125" })).toBeVisible()
    await expect(section(page).getByText(RESTORE)).toHaveCount(0)
    await expect(section(page).getByText(CONFLICT)).toHaveCount(0)
    expect(await storedDraft(page)).not.toBeNull()
  })

  test("the app bar's Return to 1health purges this user's drafts only", async ({ page }) => {
    await page.evaluate(
      ([mine, other]) => {
        const draft = JSON.stringify({ savedAt: Date.now(), baseHash: "0".repeat(64), values: { number: "4155550000" } })
        window.localStorage.setItem(mine, draft)
        window.localStorage.setItem(other, draft)
      },
      [KEY, "pp:draft:v1:demo:77:phone"],
    )
    const logouts = await mockExit(page)
    await page.getByRole("link", { name: "Return to 1health" }).click()
    await page.waitForURL((url) => url.origin === new URL(PORTAL_URL).origin)
    expect(logouts()).toBe(1)
    await relaunch(page, ANN)
    expect(await storedDraft(page)).toBeNull()
    expect(await storedDraft(page, "pp:draft:v1:demo:77:phone")).not.toBeNull()
  })
})
