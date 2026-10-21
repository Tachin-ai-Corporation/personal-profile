import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import { mockAccountDefaults, mockNpiAvailability, mockRegisterNpi, REGISTERED_PROVIDER_NPI, setTheme, signIn, test } from "./fixtures"

const personalName = "Search for your personal NPI number"
const practiceName = "Search for your practice's (hospital, clinic, lab, etc.) NPI Number"
const personal = (page: Page) => page.getByRole("combobox", { name: personalName })
const practice = (page: Page) => page.getByRole("combobox", { name: practiceName, exact: false })
const records = [
  { id: 77, npi: 1234567890, providerFirstName: "Ann", providerLastName: "Lee" },
  { id: 88, npi: 1987654321, providerOrganizationName: "Sample Clinic" },
]
async function pick(page: Page, both: boolean) {
  await personal(page).focus()
  await expect(page.getByRole("option", { name: "1234567890, Ann Lee", exact: true })).toBeVisible()
  expect(new URL((await page.requests()).filter((request) => new URL(request.url()).pathname === "/api/1h/v2/public/npi/list").at(-1)!.url()).searchParams.get("entityTypeCode")).toBe("1")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  if (both) {
    await practice(page).focus()
    await expect(page.getByRole("option", { name: "1987654321, Sample Clinic", exact: true })).toBeVisible()
    expect(new URL((await page.requests()).filter((request) => new URL(request.url()).pathname === "/api/1h/v2/public/npi/list").at(-1)!.url()).searchParams.get("entityTypeCode")).toBe("2")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
  }
  await page.getByRole("button", { name: "Register", exact: true }).focus()
}
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
}
test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAccountDefaults(page)
  await page.route("**/api/1h/v2/public/npi/list?*", (route) => {
    const type = new URL(route.request().url()).searchParams.get("entityTypeCode")
    expect(["1", "2"]).toContain(type)
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [records[type === "1" ? 0 : 1]], totalElements: 1 }) })
  })
  await mockNpiAvailability(page, 77)
  await mockNpiAvailability(page, 88)
})

for (const both of [false, true]) {
  test(`keyboard registers ${both ? "personal and practice" : "personal only"}, transitions to complete credentials and focuses heading`, async ({ page }) => {
    const posts = await mockRegisterNpi(page)
    let reads = 0
    await page.route("**/api/1h/v2/user/npi", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(++reads === 1 ? {} : { ...REGISTERED_PROVIDER_NPI, ...(both ? {} : { practiceNpi: null }) }) }))
    await page.goto("/account?tab=provider")
    await expect(personal(page)).toBeVisible()
    await pick(page, both)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeFocused()
    await expect(page.getByText("Family Medicine", { exact: true })).toBeVisible()
    await expect(page.getByText("TEST-LICENSE-01", { exact: true })).toBeVisible()
    await expect(page.getByRole("combobox")).toHaveCount(0)
    await expect(page.getByText(both ? "Provider and practice NPIs registered" : "Provider NPI registered", { exact: true })).toBeVisible()
    expect(posts()).toHaveLength(1)
    expect(posts()[0].postDataJSON()).toEqual(both ? { providerNpiId: 77, practiceNpiId: 88 } : { providerNpiId: 77 })
    for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await accessible(page) }
  })
}

test("required and both taken errors are announced and linked, preserve selections, pass axe in both themes", async ({ page }) => {
  const posts = await mockRegisterNpi(page)
  await mockNpiAvailability(page, 77, { body: true })
  await mockNpiAvailability(page, 88, { body: true })
  await page.goto("/account?tab=provider")
  await page.getByRole("button", { name: "Register", exact: true }).click()
  await expect(personal(page)).toBeFocused()
  await expect(personal(page)).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByText("Personal NPI is required", { exact: true })).toBeVisible()
  await pick(page, true)
  await page.keyboard.press("Enter")
  await expect(page.getByText("This personal NPI is already registered. Check that you selected your own.")).toBeVisible()
  await expect(page.getByText("This practice NPI is already registered. Check that you selected the right practice.")).toBeVisible()
  await expect(personal(page)).toBeFocused()
  expect(posts()).toHaveLength(0)
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await page.keyboard.press("Escape"); await accessible(page) }
})

test("held checks show progress, freeze picks, and tab exit prevents a late POST", async ({ page }) => {
  const posts = await mockRegisterNpi(page)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let checks = 0
  await page.route("**/api/1h/v2/health/npi/77/is-registered", async (route) => {
    checks++
    await held
    await route.fulfill({ status: 200, contentType: "application/json", body: "false" }).catch(() => undefined)
  })
  await page.goto("/account?tab=provider")
  await pick(page, false)
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Registering…" })).toHaveAttribute("aria-disabled", "true")
  await expect(personal(page)).toBeDisabled()
  expect(checks).toBe(1)
  await page.getByRole("tab", { name: "Personal Account", exact: true }).click()
  release()
  await page.getByRole("tab", { name: "Individual Provider Registration", exact: true }).click()
  await expect(personal(page)).toHaveValue("")
  expect(posts()).toHaveLength(0)
})

for (const status of [502, 504]) {
  test(`${status} shows persistent registration fallback and never retries mutation`, async ({ page }) => {
    const posts = await mockRegisterNpi(page, { status, body: { message: "Synthetic internal detail" } })
    await page.goto("/account?tab=provider")
    await pick(page, false)
    await page.keyboard.press("Enter")
    await expect(page.getByText("There was an error in the registration. Please call 1-888-555-1212 for assistance.")).toBeVisible()
    await expect(personal(page)).toHaveValue("1234567890, Ann Lee")
    expect(posts()).toHaveLength(1)
    await personal(page).fill("changed")
    await page.keyboard.press("Escape")
    for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await accessible(page) }
    expect(posts()).toHaveLength(1)
    await expect(page.getByText("Synthetic internal detail")).toHaveCount(0)
  })
}

test("acknowledged registration with failed refresh offers read-only Retry without another POST", async ({ page }) => {
  const posts = await mockRegisterNpi(page)
  let reads = 0
  await page.route("**/api/1h/v2/user/npi", (route) => {
    reads++
    return route.fulfill({ status: reads === 2 ? 502 : 200, contentType: "application/json", body: JSON.stringify(reads === 1 ? {} : reads === 2 ? {} : REGISTERED_PROVIDER_NPI) })
  })
  await page.goto("/account?tab=provider")
  await pick(page, false)
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible()
  await expect(page.getByRole("combobox")).toHaveCount(0)
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByText("Family Medicine", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Healthcare credentials" })).toBeFocused()
  expect(posts()).toHaveLength(1)
})
