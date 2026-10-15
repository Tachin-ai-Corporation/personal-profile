import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  expectHeaderTabOrder,
  mockAccountDefaults,
  mockHeaderPicture,
  mockProfileDefaults,
  PROFILE_PICTURE_FILE_ID,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * Story 1.9 (Team A): the Profile Picture in the shared header, on `/` and
 * `/account`. Every test runs under the fail-fast `test`, starts from the
 * page's defaults and overrides the picture with `mockHeaderPicture`.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const PREVIEW_SRC = `/api/1h/v2/user/profile-picture/preview?v=${PROFILE_PICTURE_FILE_ID}`
const PAGES = [
  ["/", mockProfileDefaults],
  ["/account", mockAccountDefaults],
] as const

const avatarImage = (page: Page): Locator => page.locator('img[src*="/profile-picture/preview"]')
const initialsAvatar = (page: Page): Locator => page.getByText("AL", { exact: true })

/** Counts the page's `GET /api/pp/profile-picture-id` requests. */
function countPictureIdRequests(page: Page): () => number {
  let count = 0
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/pp/profile-picture-id") count += 1
  })
  return () => count
}

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("header Profile Picture (Story 1.9)", () => {
  for (const [path, mockDefaults] of PAGES) {
    test(`shows the picture on ${path}: one id request, a decorative 40 px circle, no new Tab stop`, async ({ page }) => {
      await mockDefaults(page)
      const previews = await mockHeaderPicture(page)
      const idRequests = countPictureIdRequests(page)
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)

      const img = avatarImage(page)
      await expect(img).toBeVisible()
      await expect(img).toHaveAttribute("src", PREVIEW_SRC)
      await expect(img).toHaveAttribute("alt", "")
      await expect(img).toHaveClass(/object-cover/)
      await expect(img).toHaveClass(/rounded-full/)
      expect(await img.evaluate((el: HTMLImageElement) => [el.getBoundingClientRect().width, el.getBoundingClientRect().height])).toEqual([40, 40])
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
      await expect(initialsAvatar(page)).toHaveCount(0)

      await expectHeaderTabOrder(page)
      await page.waitForLoadState("networkidle")
      expect(idRequests()).toBe(1)
      expect(previews().length).toBeGreaterThanOrEqual(1)
    })
  }

  for (const [label, image] of [
    ["a 404", { status: 404, contentType: "application/json", body: Buffer.from('{"errorCode":"NOT_FOUND"}') }],
    ["a non-image", { status: 200, contentType: "text/plain", body: Buffer.from("not an image") }],
  ] as const) {
    test(`a failing preview (${label}) keeps the initials, with no error`, async ({ page }) => {
      await mockProfileDefaults(page)
      const previews = await mockHeaderPicture(page, PROFILE_PICTURE_FILE_ID, image)
      await page.goto("/")
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      await expect.poll(() => previews().length).toBeGreaterThanOrEqual(1)
      await expect(initialsAvatar(page)).toBeVisible()
      await expect(avatarImage(page)).toHaveCount(0)
      // Next's route announcer is an empty alert; no alert may carry text.
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0)
    })
  }

  for (const [path, mockDefaults] of PAGES) {
    test(`axe light and dark with a picture on ${path}; no horizontal scroll`, async ({ page }) => {
      await mockDefaults(page)
      await mockHeaderPicture(page)
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
      await expect(avatarImage(page)).toBeVisible()
      await expectNoAxeViolations(page, `${path} header with a picture`)
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }
})
