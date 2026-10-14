import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { launch as launchViaAuth } from "./fixtures"

/**
 * Story 1.8: the profile page shell in the real app (launched against the
 * server-side upstream mock). Deep link + refresh, the tab URL replace,
 * keyboard Tab order, 360 px layout and target sizes, and axe (WCAG 2.1 AA) on
 * every tab in light and dark, on both projects.
 */

const TABS = ["contacts", "insurance", "medical"] as const
const TAB_NAMES = { contacts: /^Contacts/, insurance: /^Insurance/, medical: /^Medical/ } as const

/**
 * Launch through `/auth` (lands on `/?tab=contacts`; there is no launch tab
 * param), then open the deep link, if any.
 */
async function launch(page: Page, query = "tab=contacts", hash = "") {
  await launchViaAuth(page)
  if (query !== "tab=contacts" || hash) {
    await page.goto(`/?${query}${hash}`)
    await expect(page).toHaveURL(new RegExp(`/\\?tab=contacts${hash}$`))
  }
  // The header slot's name arrives through callApi; wait so the layout is settled.
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
}

function isMobile(projectName: string) {
  return projectName === "mobile-360"
}

test("?tab=contacts#signature scrolls to the Signature row and survives a refresh", async ({ page }) => {
  await launch(page, "tab=contacts", "#signature")
  const signature = page.locator("#signature")
  await expect(signature).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  await page.reload()
  await expect(page).toHaveURL(/\/\?tab=contacts#signature$/)
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
  await expect(signature).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await expect(page.getByRole("tab", { name: TAB_NAMES.contacts })).toHaveAttribute("aria-selected", "true")
})

test("switching tabs replaces ?tab= (no history entry, hash dropped) and a refresh reopens the tab", async ({ page }) => {
  await launch(page, "tab=contacts", "#phone")
  const historyLength = await page.evaluate(() => window.history.length)

  await page.getByRole("tab", { name: TAB_NAMES.insurance }).click()
  await expect(page).toHaveURL(/\/\?tab=insurance$/)
  await expect(page.getByRole("region", { name: "Insurance" })).toBeVisible()
  await page.getByRole("tab", { name: TAB_NAMES.medical }).click()
  await expect(page).toHaveURL(/\/\?tab=medical$/)
  await expect(page.getByText("Coming soon: your medical information will appear here.", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)

  await page.reload()
  await expect(page).toHaveURL(/\/\?tab=medical$/)
  await expect(page.getByRole("tab", { name: TAB_NAMES.medical })).toHaveAttribute("aria-selected", "true")

  await page.goto("/?tab=insurance")
  await expect(page.getByRole("tab", { name: TAB_NAMES.insurance })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("region", { name: "Insurance" })).toBeVisible()
})

test("an unknown tab opens Contacts and the URL is normalised to ?tab=contacts (hash kept)", async ({ page }) => {
  await launch(page)
  await page.goto("/?tab=foo#email")
  await expect(page).toHaveURL(/\/\?tab=contacts#email$/)
  await expect(page.getByRole("tab", { name: TAB_NAMES.contacts })).toHaveAttribute("aria-selected", "true")
  await page.goto("/")
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
})

test("an unknown hash or a Section hash on Insurance leaves the page at the top", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(String(err)))
  await launch(page)
  await page.goto("/?tab=contacts#nope")
  await expect(page.getByText("Test User", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.goto("/?tab=insurance#phone")
  await expect(page.getByRole("region", { name: "Insurance" })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(errors).toEqual([])
})

test("Section menu / Jump to moves to the Section, focuses its h2 and replaces the hash", async ({ page }, testInfo) => {
  await launch(page)
  const historyLength = await page.evaluate(() => window.history.length)
  if (isMobile(testInfo.project.name)) {
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden()
    await page.getByRole("combobox", { name: "Jump to" }).click()
    await page.getByRole("option", { name: "Addresses" }).click()
  } else {
    await expect(page.getByRole("combobox", { name: "Jump to" })).toBeHidden()
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Addresses" }).click()
  }
  await expect(page).toHaveURL(/\/\?tab=contacts#addresses$/)
  await expect(page.getByRole("heading", { level: 2, name: "Addresses" })).toBeFocused()
  await expect(page.locator("#addresses")).toBeInViewport()
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength)
  if (!isMobile(testInfo.project.name)) {
    const nav = page.getByRole("navigation", { name: "Sections" })
    await expect(nav.locator('[aria-current="location"]')).toHaveCount(1)
    await expect(nav.locator('[aria-current="location"]')).toHaveText(/05\s*Addresses/)
  }
})

test("Tab order: app bar → active tab → Section menu (or Jump to)", async ({ page }, testInfo) => {
  await launch(page)
  const expected = isMobile(testInfo.project.name)
    ? ["link:Return to 1health", "tab:Contacts", "combobox:Jump to"]
    : [
        "link:Return to 1health",
        "tab:Contacts",
        "link:01Personal information",
        "link:02Phone",
        "link:03Email",
        "link:04Social media",
        "link:05Addresses",
      ]
  const seen: string[] = []
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press("Tab")
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return "none"
        const role = el.getAttribute("role") ?? (el.tagName === "A" ? "link" : el.tagName.toLowerCase())
        const labelledBy = el.getAttribute("aria-labelledby")
        const name = labelledBy ? document.getElementById(labelledBy)?.textContent : el.textContent
        return `${role}:${(name ?? "").trim().replace(/Coming soon|Soon/g, "").trim()}`
      }),
    )
  }
  expect(seen).toEqual(expected)

  // The focused control shows the focus ring: a 2 px solid outline, 2 px offset, plus the glow.
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element)
    return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset, shadow: s.boxShadow }
  })
  expect(ring).toMatchObject({ width: "2px", style: "solid", offset: "2px" })
  expect(ring.shadow).not.toBe("none")
})

test("360 px: no horizontal scroll on any tab, 16 px gutters, 44 × 44 targets", async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo.project.name), "360 px layout runs on the mobile-360 project")
  await launch(page)

  for (const id of TABS) {
    await page.getByRole("tab", { name: TAB_NAMES[id] }).click()
    await expect(page).toHaveURL(new RegExp(`\\?tab=${id}$`))
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth, `no horizontal scroll on ${id}`).toBeLessThanOrEqual(overflow.clientWidth)

    for (const name of Object.values(TAB_NAMES)) {
      const box = await page.getByRole("tab", { name }).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
    }
    const ret = await page.getByRole("link", { name: "Return to 1health" }).boundingBox()
    expect(ret!.height).toBeGreaterThanOrEqual(44)
    expect(ret!.width).toBeGreaterThanOrEqual(44)
  }

  await page.getByRole("tab", { name: TAB_NAMES.contacts }).click()
  const jump = await page.getByRole("combobox", { name: "Jump to" }).boundingBox()
  expect(jump!.height).toBeGreaterThanOrEqual(44)
  expect(jump!.width).toBeGreaterThanOrEqual(44)

  const gutters = await page.evaluate(() => {
    const pad = (el: Element | null) => (el ? getComputedStyle(el).paddingLeft : "missing")
    return {
      appBar: pad(document.querySelector("header")),
      header: pad(document.querySelector('main > section[aria-label="Profile"]')),
      tabs: pad(document.querySelector('[role="tablist"]')),
      sections: pad(document.getElementById("personal")?.parentElement ?? null),
      jumpTo: pad(document.getElementById("jump-to-trigger")?.parentElement ?? null),
    }
  })
  expect(gutters).toEqual({ appBar: "16px", header: "16px", tabs: "16px", sections: "16px", jumpTo: "16px" })
})

test("desktop: the Section menu items are 44 px rows and the menu is sticky", async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo.project.name), "desktop layout runs on the chromium-desktop project")
  await launch(page)
  const nav = page.getByRole("navigation", { name: "Sections" })
  for (const link of await nav.getByRole("link").all()) {
    const box = await link.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("sticky")
  expect(await nav.evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().width)).toBe(200)
})

for (const theme of ["light", "dark"] as const) {
  for (const id of TABS) {
    test(`axe: ${id} tab, ${theme} theme, has no WCAG 2.1 AA violations`, async ({ page }) => {
      await launch(page)
      if (id !== "contacts") {
        await page.getByRole("tab", { name: TAB_NAMES[id] }).click()
        await expect(page).toHaveURL(new RegExp(`\\?tab=${id}$`))
      }
      if (theme === "dark") {
        await page.evaluate(() => document.documentElement.classList.add("dark"))
      }
      // Let color transitions (e.g. the tab triggers') finish so axe samples the
      // settled theme, not a mid-transition blend.
      await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition)))
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
    })
  }
}
