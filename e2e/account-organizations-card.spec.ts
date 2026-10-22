import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { mockAccountDefaults, mockOrganizations, setTheme, signIn, test } from "./fixtures"
import { organizationWire, organizationsPage } from "./fixtures/orgs"

const name = "A very long organization name that remains fully accessible at every viewport width"
const allTypes = ["Lab", "Health Provider", "Supplier", "Go To Market", "Healthcare", "Population Health", "Insurance", "Carrier", "Manufacturer", "Enterprise", "Government Agency"]
const longEmail = `${"long".repeat(32)}@example.com`
const contact = { firstName: "Ann", middleName: "Mae", lastName: "Lee", phoneNumber: "4155512125", phoneNumberRegion: "us", email: longEmail, contactTypes: ["Primary"] }
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")
async function geometry(page: Page, target?: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  if (target) {
    const box = await target.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.width).toBeGreaterThanOrEqual(44)
  }
}
async function axe(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
}
test.beforeEach(async ({ page }) => { await signIn(page); await mockAccountDefaults(page) })

test("protected logos load or fall back silently; contact keyboard, names, overflow and both themes", async ({ page }) => {
  await mockOrganizations(page, { body: organizationsPage([
    organizationWire({ tenantId: 42, enabledInTenant: false, organization: { name, shortOrganizationName: name, type: allTypes, personContacts: [contact] } }),
    organizationWire({ tenantId: 43, organization: { name: "Broken Logo", shortOrganizationName: "Broken Logo", type: [], personContacts: [] } }),
  ]) })
  let completeLogo!: () => void
  const pending = new Promise<void>((resolve) => { completeLogo = resolve })
  await page.route("**/api/pp/org-logo/42", async (route) => { await pending; await route.fulfill({ contentType: "image/png", body: png }) })
  await page.route("**/api/pp/org-logo/43", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }))
  await page.goto("/account?tab=organizations")
  const card = page.getByRole("article", { name, exact: true })
  const logo = card.locator("img")
  await expect(card.getByText("AV", { exact: true })).toBeVisible()
  completeLogo()
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1)
  expect((await logo.boundingBox())!.height).toBe(72)
  await expect(page.getByRole("article", { name: "Broken Logo", exact: true }).getByText("BL", { exact: true })).toBeVisible()
  await expect(page.getByRole("article", { name: "Broken Logo", exact: true }).locator("img")).toHaveCount(0)
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const info = card.getByRole("button", { name: `Primary contact for ${name}` })
    await geometry(page, info)
    await info.focus()
    const dialog = page.getByRole("dialog", { name: "Primary contact" })
    await expect(dialog.getByText("Ann Mae Lee")).toBeVisible()
    await expect(dialog.getByText("+1 (415) 551-2125")).toBeVisible()
    const email = dialog.getByRole("link", { name: longEmail })
    await expect(email).toHaveAttribute("href", `mailto:${longEmail}`)
    await expect(info).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(email).toBeFocused()
    const bounds = await dialog.boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(280)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await geometry(page, email)
    await axe(page)
    await page.keyboard.press("Escape")
    await expect(info).toBeFocused()
    await expect(dialog).toHaveCount(0)
    const nameTrigger = card.getByRole("heading", { name, exact: true, level: 3 })
    await nameTrigger.focus()
    await expect(page.getByRole("tooltip")).toHaveText(name)
    await page.keyboard.press("Escape")
    const types = card.getByRole("group", { name: "Organization types" })
    for (const label of ["Lab", "Healthcare", "Supplier", "Go To Market"]) {
      const target = types.getByRole("button", { name: label, exact: true })
      await target.focus()
      await expect(page.getByRole("tooltip")).toHaveText(label)
      await geometry(page, target)
      await page.keyboard.press("Escape")
    }
    const overflow = types.getByRole("button", { name: "6 more types: Carrier, Enterprise, Government Agency, Insurance, Manufacturer, Population Health" })
    await overflow.focus()
    await expect(page.getByRole("tooltip")).toContainText("Population Health")
    await geometry(page, overflow)
    await axe(page)
    await page.keyboard.press("Escape")
    await geometry(page)
    await axe(page)
  }
})

test("every mapped type, unknown and absent types render safe accessible hints", async ({ page }) => {
  const types = [...allTypes.filter((type) => type !== "Healthcare"), "n/a", "Unknown Platform Type"]
  await mockOrganizations(page, { body: organizationsPage(types.map((type, index) => organizationWire({ tenantId: 100 + index, organization: { name: `Organization ${index}`, type: [type], personContacts: [] } }))) })
  await page.route("**/api/pp/org-logo/*", (route) => route.fulfill({ status: 404, body: "{}" }))
  await page.goto("/account?tab=organizations")
  const labels = ["Lab", "Healthcare", "Supplier", "Go To Market", "Population Health", "Insurance", "Carrier", "Manufacturer", "Enterprise", "Government Agency", "No types selected for this organization", "Unknown Platform Type"]
  for (let index = 0; index < labels.length; index++) {
    const card = page.getByRole("article", { name: `Organization ${index}`, exact: true })
    await expect(card.getByRole("button", { name: labels[index], exact: true })).toBeVisible()
  }
  await geometry(page)
})

test("touch opens name, type, overflow and contact hints and outside tap closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch interaction runs in mobile-360")
  await mockOrganizations(page, { body: organizationsPage([organizationWire({ tenantId: 42, organization: { name, shortOrganizationName: name, type: allTypes, personContacts: [contact] } })]) })
  await page.route("**/api/pp/org-logo/*", (route) => route.fulfill({ status: 404, body: "{}" }))
  await page.goto("/account?tab=organizations")
  const card = page.getByRole("article", { name, exact: true })
  const outside = page.getByRole("tab", { name: "My Organizations" })
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    for (const target of [card.getByRole("heading", { name, exact: true, level: 3 }), card.getByRole("button", { name: "Lab", exact: true }), card.getByRole("button", { name: /^6 more types:/ })]) {
      await target.tap()
      await expect(page.getByRole("tooltip")).toBeVisible()
      await geometry(page)
      await outside.tap()
      await expect(page.getByRole("tooltip")).toHaveCount(0)
    }
    const info = card.getByRole("button", { name: `Primary contact for ${name}` })
    await info.tap()
    await expect(page.getByRole("dialog", { name: "Primary contact" })).toBeVisible()
    await geometry(page)
    await outside.tap()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  }
})

test("mouse hover opens contact, name, type and overflow hints", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse interaction runs in desktop")
  await mockOrganizations(page, { body: organizationsPage([organizationWire({ tenantId: 42, organization: { name, shortOrganizationName: name, type: allTypes, personContacts: [contact] } })]) })
  await page.route("**/api/pp/org-logo/*", (route) => route.fulfill({ status: 404, body: "{}" }))
  await page.goto("/account?tab=organizations")
  const card = page.getByRole("article", { name, exact: true })
  const outside = page.getByRole("tab", { name: "My Organizations" })
  await card.getByRole("button", { name: `Primary contact for ${name}` }).hover()
  await expect(page.getByRole("dialog", { name: "Primary contact" })).toBeVisible()
  await outside.hover()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  for (const target of [card.getByRole("heading", { name, exact: true, level: 3 }), card.getByRole("button", { name: "Lab", exact: true }), card.getByRole("button", { name: /^6 more types:/ })]) {
    await target.hover()
    await expect(page.getByRole("tooltip")).toBeVisible()
    // Move beyond Radix's trigger-to-tooltip hover corridor before asserting closure.
    await page.mouse.move(0, 0, { steps: 5 })
    await expect(page.getByRole("tooltip")).toHaveCount(0)
  }
})

test("card Tab order skips the name and pagination focuses its heading tooltip", async ({ page }) => {
  const org = (tenantId: number, title: string) => organizationWire({ tenantId, organization: { name: title, type: allTypes, personContacts: [] } })
  await page.route("**/api/1h/v2/user/organization/portal?**", (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get("page"))
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(organizationsPage([org(pageNumber === 0 ? 42 : 43, pageNumber === 0 ? name : "Next page organization")], { pageNumber, totalPages: 2, totalElements: 13 })) })
  })
  await page.route("**/api/pp/org-logo/*", (route) => route.fulfill({ status: 404, body: "{}" }))
  await page.goto("/account?tab=organizations")
  const card = page.getByRole("article", { name, exact: true })
  const info = card.getByRole("button", { name: `Primary contact for ${name}` })
  await info.focus()
  await expect(info).toBeFocused()
  for (const label of ["Lab", "Healthcare", "Supplier", "Go To Market", "6 more types: Carrier, Enterprise, Government Agency, Insurance, Manufacturer, Population Health", `Enter portal for ${name}`]) {
    await page.keyboard.press("Tab")
    await expect(card.getByRole("button", { name: label, exact: true })).toBeFocused()
  }
  await page.getByRole("navigation", { name: "Organization pages" }).getByRole("button", { name: "Next", exact: true }).click()
  const heading = page.getByRole("heading", { name: "Next page organization", level: 3 })
  await expect(heading).toBeFocused()
  await expect(page.getByRole("tooltip")).toHaveText("Next page organization")
  await expect(heading).toHaveAttribute("tabindex", "-1")
})
