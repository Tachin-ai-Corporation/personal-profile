import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import {
  test, mockAccountDefaults, mockOrganizations, mockExit, mockMyself, mockUserEdit,
  ACCOUNT_SETTINGS_MYSELF, PORTAL_URL, setTheme, signIn,
} from "./fixtures"
import { organizationWire, organizationsPage } from "./fixtures/orgs"

const HANDOFF = "/handoff/portal?to=tenant&tenantId=42"
const draftKey = "pp:draft:v1:demo:42:phone"

async function organizationData(page: Page, enabledInTenant = true) {
  const dnn = organizationWire({ tenantId: 42, enabledInTenant, organization: {
    name: "DNN Diagnostics", shortOrganizationName: "DNN", type: ["Lab", "Health Provider"],
    personContacts: [{ firstName: "Dana", middleName: "M", lastName: "Ng", email: "dana@example.test", contactTypes: ["Primary"] }],
  } })
  await mockOrganizations(page, { body: organizationsPage([dnn]) })
  // The card's logo failure is a legitimate silent initials fallback.
  await page.route("**/api/pp/org-logo/**", (route) => route.fulfill({ status: 404, body: "" }))
  return dnn
}

function trackForbiddenActions(page: Page) {
  const requests: string[] = []
  page.on("request", (request) => {
    if (/logout|switch[-_/]?tenant/i.test(request.url())) requests.push(request.url())
  })
  return requests
}

test.beforeEach(async ({ page }) => {
  await mockAccountDefaults(page)
  await signIn(page)
})

for (const theme of ["light", "dark"] as const) {
  test(`UJ-104 search, contact and real same-tab handoff in ${theme}`, async ({ page, context }) => {
    const dnn = await organizationData(page)
    const other = organizationWire({ tenantId: 43, organization: {
      name: "Acme Diagnostics", shortOrganizationName: "Acme", type: ["Lab"], personContacts: [],
    } })
    await mockOrganizations(page, { body: organizationsPage([dnn, other]) })
    const forbidden = trackForbiddenActions(page)
    const logouts = await mockExit(page)
    await page.goto("/account?tab=organizations")
    await setTheme(page, theme)
    await expect(page.getByRole("article")).toHaveCount(2)
    await expect(page.getByRole("article", { name: "DNN", exact: true })).toBeVisible()
    await expect(page.getByRole("article", { name: "Acme", exact: true })).toBeVisible()
    const search = page.getByRole("searchbox", { name: "Search organizations" })
    const queryResponse = page.waitForResponse((response) => response.url().includes("/v2/user/organization/portal?") && new URL(response.url()).searchParams.get("name") === "dnn")
    // The server search removes the nonmatching organization after the actual 500 ms debounce.
    await mockOrganizations(page, { body: organizationsPage([dnn]) })
    await search.fill("dnn")
    await queryResponse
    await expect(page.getByRole("article")).toHaveCount(1)
    await expect(page.getByRole("article", { name: "Acme", exact: true })).toHaveCount(0)
    await expect(page.getByRole("status").filter({ hasText: /^1 organization$/ })).toHaveText("1 organization")
    const card = page.getByRole("article", { name: "DNN", exact: true })
    const contact = card.getByRole("button", { name: "Primary contact for DNN", exact: true })
    await contact.click()
    await expect(page.getByRole("dialog", { name: "Primary contact", exact: true })).toBeVisible()
    await expect(page.getByText("Dana M Ng", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "dana@example.test", exact: true })).toHaveAttribute("href", "mailto:dana@example.test")
    await page.keyboard.press("Escape")
    await expect(contact).toBeFocused()
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const draft = await page.evaluate((key) => {
      const value = JSON.stringify({ savedAt: Date.now(), baseHash: "retained", values: { phoneNumber: "4155552125" } })
      localStorage.setItem(key, value)
      return value
    }, draftKey)
    const pagesBefore = context.pages().length
    const handoff = page.waitForResponse((response) => new URL(response.url()).pathname === "/handoff/portal")
    await card.getByRole("button", { name: "Enter portal for DNN", exact: true }).click()
    const response = await handoff
    expect(new URL(response.url()).pathname + new URL(response.url()).search).toBe(HANDOFF)
    expect(response.status()).toBe(303)
    // Story 7.3's approved tenant handoff currently resolves to the environment portal root.
    expect(response.headers().location).toBe(new URL(PORTAL_URL).href)
    expect(response.headers()["set-cookie"]).toBeUndefined()
    await page.waitForURL(new URL(PORTAL_URL).href)
    expect(context.pages()).toHaveLength(pagesBefore)
    expect(logouts()).toBe(0)
    expect(forbidden).toEqual([])
    await page.goto("/account?tab=organizations")
    expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft)
  })
}

test("disabled membership keeps its reason focusable and contact usable without a handoff", async ({ page }) => {
  await organizationData(page, false)
  const forbidden = trackForbiddenActions(page)
  const handoffs: string[] = []
  page.on("request", (request) => { if (request.url().includes("/handoff/portal")) handoffs.push(request.url()) })
  await page.goto("/account?tab=organizations")
  const card = page.getByRole("article", { name: "DNN", exact: true })
  const action = card.getByRole("button", { name: "Enter portal for DNN", exact: true })
  await action.focus()
  await expect(action).toBeFocused()
  await expect(action).toHaveAttribute("aria-disabled", "true")
  await expect(action).toHaveAccessibleDescription("You're disabled in this organization")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Space")
  await action.click({ force: true })
  await expect(page.getByRole("tooltip")).toHaveText("You're disabled in this organization")
  await page.keyboard.press("Escape")
  await card.getByRole("button", { name: "Primary contact for DNN", exact: true }).click()
  await expect(page.getByText("Dana M Ng", { exact: true })).toBeVisible()
  expect(handoffs).toEqual([])
  expect(forbidden).toEqual([])
})

for (const decision of ["Keep editing", "Discard", "Save", "Save failure"] as const) {
  test(`dirty account guard before Organizations: ${decision}`, async ({ page }) => {
    await organizationData(page)
    await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
    const writes = await mockUserEdit(page, { status: decision === "Save failure" ? 500 : 204 })
    const forbidden = trackForbiddenActions(page)
    await page.goto("/account")
    const account = page.getByRole("region", { name: "Personal account settings", exact: true })
    await account.getByRole("button", { name: "Edit", exact: true }).click()
    await account.getByRole("textbox", { name: "First name", exact: true }).fill("Bea")
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pp:draft:v1:demo:42:account"))).not.toBeNull()
    await page.getByRole("tab", { name: "My Organizations", exact: true }).click()
    const guard = page.getByRole("alertdialog", { name: "You have unsaved changes", exact: true })
    await guard.getByRole("button", { name: decision === "Save failure" ? "Save" : decision, exact: true }).click()
    if (decision === "Keep editing" || decision === "Save failure") {
      await expect(account.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Bea")
      await expect(page.getByRole("article", { name: "DNN", exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem("pp:draft:v1:demo:42:account"))).not.toBeNull()
    } else {
      await expect(page.getByRole("article", { name: "DNN", exact: true })).toBeVisible()
      // The account panel is correctly unmounted when Organizations becomes active.
      await expect(account).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem("pp:draft:v1:demo:42:account"))).toBeNull()
    }
    expect(writes()).toHaveLength(decision.startsWith("Save") ? 1 : 0)
    expect(forbidden).toEqual([])
  })
}
