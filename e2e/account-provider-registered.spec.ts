import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import { ANN, REGISTERED_PROVIDER_NPI, mockAccountDefaults, mockMyself, mockUserNpi, mockNpiAvailability, mockPracticeSupport, mockFileDownload, mockProfileDefaults, setTheme, signIn, test } from "./fixtures"

const notice = "This organization already exists - please contact their support to be added to their portal."
const action = "Register your practice to enable ordering"
async function touchTarget(target: Locator) {
  const box = await target.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(box!.width).toBeGreaterThanOrEqual(44)
}
async function accessible(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
  await mockAccountDefaults(page)
  await mockUserNpi(page, { body: REGISTERED_PROVIDER_NPI })
  await mockMyself(page, { body: { ...ANN, signature: { id: 501, name: "signature.png" } } })
  await mockFileDownload(page, 501)
})

test("complete credentials, lazy support, signature hints and keyboard order in both themes", async ({ page }) => {
  let supportCalls = 0
  await page.route("**/api/pp/practice-support", (route) => {
    supportCalls++
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Clinic support", phone: "4155552671", phoneRegion: "US", email: "support@example.com" }) })
  })
  await page.goto("/account?tab=provider")
  const table = page.getByRole("table", { name: "Healthcare credentials" })
  await expect(table).toBeVisible()
  await expect(table.getByRole("rowheader")).toHaveText(["NPI", "Taxonomy", "Health Information Exchange", "Practice name", "Practice address", "Practice NPI", "Licenses", "Address of practice", "Signature"])
  for (const value of ["1234567890", "Family Medicine", "Sample Exchange", "2 Test Avenue", "1987654321", "TEST-LICENSE-01", "1 Test Street", "Suite 2"]) await expect(table.getByText(value, { exact: true })).toBeVisible()
  await expect(page.getByText(notice, { exact: true })).toBeVisible()
  await expect(page.getByRole("img", { name: "Your signature" })).toBeVisible()
  expect(supportCalls).toBe(0)
  const practice = table.getByRole("button", { name: "Sample Clinic" })
  const help = table.getByRole("button", { name: "About the signature" })
  const profile = table.getByRole("button", { name: "Personal Profile", exact: true })
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    await touchTarget(practice)
    await touchTarget(help)
    await touchTarget(profile)
    await practice.focus()
    await expect(page.getByText("Clinic support", { exact: true })).toBeVisible()
    await expect(practice).toBeFocused()
    await expect(practice).toHaveAttribute("aria-expanded", "true")
    await page.keyboard.press("Tab")
    await expect(page.getByRole("link", { name: "support@example.com" })).toBeFocused()
    await expect(page.getByRole("link", { name: "support@example.com" })).toHaveAttribute("href", "mailto:support@example.com")
    await accessible(page)
    await page.keyboard.press("Tab")
    await expect(help).toBeFocused()
    await expect(page.getByRole("tooltip")).toHaveText("The signature can be changed from the Personal Profile")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Tab")
    await expect(profile).toBeFocused()
    await accessible(page)
  }
  expect(supportCalls).toBe(1)
  await expect(page.getByRole("button", { name: action })).toHaveCount(0)
})

for (const name of ["A", "-", null]) {
  test(`practice support target stays 44px for ${name ?? "a missing name"}`, async ({ page }) => {
    await mockUserNpi(page, { body: { ...REGISTERED_PROVIDER_NPI, practiceNpi: { ...REGISTERED_PROVIDER_NPI.practiceNpi, providerOrganizationName: name } } })
    await mockPracticeSupport(page, { status: 200, body: { name: "Clinic support" } })
    await page.goto("/account?tab=provider")
    const trigger = page.getByRole("table", { name: "Healthcare credentials" }).getByRole("button", { name: name ?? "Not provided", exact: true })
    await expect(trigger).toBeVisible()
    await touchTarget(trigger)
    await trigger.click()
    await expect(page.getByText("Clinic support", { exact: true })).toBeVisible()
  })
}

for (const email of ["a@b.c", `${"a".repeat(64)}@${"b".repeat(63)}.example.com`]) {
  test(`support email of ${email.length} characters has a 44px target and fits its popover in both themes`, async ({ page }) => {
    await mockPracticeSupport(page, { status: 200, body: { email } })
    for (const theme of ["light", "dark"] as const) {
      await page.goto("/account?tab=provider")
      await setTheme(page, theme)
      await page.getByRole("button", { name: "Sample Clinic", exact: true }).focus()
      const link = page.getByRole("link", { name: email, exact: true })
      await expect(link).toBeVisible()
      await touchTarget(link)
      await expect(link).toHaveAttribute("href", `mailto:${email}`)
      await page.keyboard.press("Tab")
      await expect(link).toBeFocused()
      const geometry = await link.evaluate((element) => {
        const paragraph = element.parentElement!
        const popover = element.closest('[data-slot="info-popover"]')!
        const paragraphBox = paragraph.getBoundingClientRect()
        const popoverBox = popover.getBoundingClientRect()
        const linkBox = element.getBoundingClientRect()
        const text = document.createRange()
        text.selectNodeContents(element)
        return {
          popoverLeft: popoverBox.left,
          popoverRight: popoverBox.right,
          contentLeft: paragraphBox.left,
          contentRight: paragraphBox.right,
          linkLeft: linkBox.left,
          linkRight: linkBox.right,
          textBounds: Array.from(text.getClientRects(), (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
          linkTop: linkBox.top,
          linkBottom: linkBox.bottom,
          viewportWidth: document.documentElement.clientWidth,
        }
      })
      expect(geometry.popoverLeft).toBeGreaterThanOrEqual(0)
      expect(geometry.popoverRight).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.linkLeft).toBeGreaterThanOrEqual(geometry.contentLeft)
      expect(geometry.linkRight).toBeLessThanOrEqual(geometry.contentRight)
      expect(geometry.textBounds.length).toBeGreaterThan(0)
      for (const rect of geometry.textBounds) {
        expect(rect.left).toBeGreaterThanOrEqual(geometry.contentLeft)
        expect(rect.right).toBeLessThanOrEqual(geometry.contentRight)
        expect(rect.top).toBeGreaterThanOrEqual(geometry.linkTop)
        expect(rect.bottom).toBeLessThanOrEqual(geometry.linkBottom)
      }
      await accessible(page)
      await page.keyboard.press("Escape")
      await expect(link).toHaveCount(0)
    }
  })
}

test("support403 stays local; signature image failure retains Profile navigation", async ({ page }) => {
  await mockPracticeSupport(page, { status: 403, body: { message: "Denied" } })
  await mockProfileDefaults(page)
  await mockFileDownload(page, 501, { status: 404, contentType: "application/json", body: Buffer.from("{}") })
  await mockMyself(page, { body: { ...ANN, signature: { id: 501, name: "signature.png" } } })
  await page.goto("/account?tab=provider")
  await expect(page.getByText("No signature available")).toBeVisible()
  await page.getByRole("button", { name: "Sample Clinic" }).focus()
  await expect(page.getByText("You don't have access to this in your current account")).toBeVisible()
  await expect(page.getByRole("table", { name: "Healthcare credentials" })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Personal Profile", exact: true }).click()
  await expect(page).toHaveURL(/\/\?tab=contacts#signature$/)
})

test("a tenant member gets neither notice nor eligibility request", async ({ page }) => {
  const availability = await mockNpiAvailability(page, 88)
  await mockMyself(page, { body: { ...ANN, tenants: [{ id: 202, name: "Sample Clinic" }] } })
  await page.goto("/account?tab=provider")
  await expect(page.getByRole("table", { name: "Healthcare credentials" })).toBeVisible()
  await expect(page.getByText("No signature available")).toBeVisible()
  await expect(page.getByText(notice)).toHaveCount(0)
  await expect(page.getByRole("button", { name: action })).toHaveCount(0)
  expect(availability()).toHaveLength(0)
})

test("verified available practice uses a same-tab handoff with no logout", async ({ page, context }) => {
  const practice = { ...REGISTERED_PROVIDER_NPI.practiceNpi, organization: null }
  await mockUserNpi(page, { body: { ...REGISTERED_PROVIDER_NPI, practiceNpi: practice } })
  const availability = await mockNpiAvailability(page, 88)
  const logouts: string[] = []
  page.on("request", (request) => { if (request.url().includes("/api/session/logout")) logouts.push(request.url()) })
  await page.route("**/handoff/portal?to=create-org", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Practice handoff</body></html>" }))
  await page.goto("/account?tab=provider")
  const cta = page.getByRole("button", { name: action })
  await expect(cta).toBeVisible()
  await touchTarget(cta)
  await expect(page.getByText(notice)).toHaveCount(0)
  for (const theme of ["light", "dark"] as const) { await setTheme(page, theme); await accessible(page) }
  await cta.click()
  await expect(page).toHaveURL(/\/handoff\/portal\?to=create-org$/)
  expect(context.pages()).toHaveLength(1)
  expect(logouts).toEqual([])
  expect(availability()).toHaveLength(1)
})
