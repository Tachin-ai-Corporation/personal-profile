import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  ACCOUNT_SETTINGS_MYSELF,
  REGISTERED_PROVIDER_NPI,
  mockAccountDefaults,
  mockMyself,
  mockOrganizations,
  mockUserNpi,
  organizationWire,
  organizationsPage,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * `/account` opts into the design refresh like `/` (Team B; feedback
 * 2026-11-03: the refresh everywhere, one accent colour): the accented
 * header band and tabs, each Section's header icon tile in the brand-primary
 * blue, Personal account settings and the registered provider view in a
 * blue-barred container that enters, and the organization cards' blue top
 * rule. Each runs with motion allowed and reduced, on desktop and at 360 px,
 * with axe in light and dark.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

const ORGANIZATIONS = organizationsPage([
  organizationWire(),
  organizationWire({ tenantId: 9, enabledInTenant: false, organization: { id: 9, name: "Bay Imaging", shortOrganizationName: null, type: ["Imaging"], personContacts: [] } }),
])

async function open(page: Page, tab: "personal" | "provider" | "organizations"): Promise<void> {
  await mockAccountDefaults(page)
  await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
  await mockUserNpi(page, { body: REGISTERED_PROVIDER_NPI })
  await mockOrganizations(page, { body: ORGANIZATIONS })
  await page.goto(`/account?tab=${tab}`)
}

/** `--brand-primary` as the browser computes a color (`rgb(…)`). */
const brandPrimary = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span")
    probe.style.color = "var(--brand-primary)"
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })

const style = (locator: Locator, property: string, pseudo?: string) =>
  locator.evaluate((element, [name, before]) => getComputedStyle(element, before || null).getPropertyValue(name), [property, pseudo ?? ""] as const)

/** A Section's header: its icon in the one tone (the tile from 640 px), and the title line in brand-primary. */
async function expectAccentedHeader(page: Page, id: string, isMobile: boolean): Promise<void> {
  const icon = page.locator(`#${id} [data-slot="animated-icon"]`)
  await expect(icon).toHaveAttribute("data-tone", "blue")
  if (isMobile) await expect(icon).toBeHidden()
  else await expect(icon.locator('[data-slot="animated-icon-tile"]')).toBeVisible()
  expect(await style(page.locator(`#${id}-heading`), "background-color", "::after")).toBe(await brandPrimary(page))
}

/** A blue-barred container that enters: a 320 ms entrance with motion, none under reduced motion. */
async function expectAccentedContainer(container: Locator, reducedMotion: string): Promise<void> {
  await expect(container).toBeVisible()
  expect(await style(container, "border-left-width")).toBe("4px")
  expect(await style(container, "border-left-color")).toBe(await brandPrimary(container.page()))
  if (reducedMotion === "reduce") {
    expect(await style(container, "animation-name")).toBe("none")
  } else {
    expect(await style(container, "animation-name")).toBe("section-enter")
    expect(Number.parseFloat(await style(container, "animation-duration"))).toBeCloseTo(0.32, 2)
  }
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`/account design refresh, reducedMotion ${reducedMotion}`, () => {
    test.use({ contextOptions: { reducedMotion } })

    test.beforeEach(async ({ page }) => {
      await signIn(page)
    })

    test("Personal Account: the accented header band and tabs; both Sections in the one tone; settings in a barred container; axe", async ({ page, isMobile }) => {
      await open(page, "personal")
      await expect(page.locator('[data-accent="true"]:has(> h1)')).toBeVisible()
      const tab = page.getByRole("tab", { name: "Personal Account", selected: true })
      await expect(tab).toHaveClass(/after:from-brand-primary/)
      expect(await style(tab, "opacity", "::after")).toBe("1")
      await expect(page.locator("#account").getByRole("table")).toBeVisible()
      await expectAccentedHeader(page, "account", isMobile)
      await expectAccentedHeader(page, "authenticator", isMobile)
      await expectAccentedContainer(page.locator('#account [data-slot="section-container"]'), reducedMotion)
      await expectNoAxeViolations(page, "Personal Account")
    })

    test("Individual Provider Registration (registered): the header and the registered view's barred container; axe", async ({ page, isMobile }) => {
      await open(page, "provider")
      await expect(page.locator("#provider").getByRole("table")).toBeVisible()
      await expectAccentedHeader(page, "provider", isMobile)
      await expectAccentedContainer(page.locator('#provider [data-slot="section-container"]'), reducedMotion)
      await expectNoAxeViolations(page, "Individual Provider Registration")
    })

    test("My Organizations: an enabled card's top rule in brand-primary, a disabled card's in the border grey; axe", async ({ page }) => {
      await open(page, "organizations")
      const cards = page.locator('[data-slot="organization-card"]')
      await expect(cards).toHaveCount(2)
      const enabled = cards.filter({ hasText: "Sample Organization" })
      const disabled = cards.filter({ hasText: "Bay Imaging" })
      expect(await style(enabled, "background-color", "::before")).toBe(await brandPrimary(page))
      expect(await style(enabled, "height", "::before")).toBe("4px")
      expect(await style(disabled, "background-color", "::before")).not.toBe(await brandPrimary(page))
      await expectNoAxeViolations(page, "My Organizations")
    })
  })
}
