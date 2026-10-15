import { expect, type Page, type Request } from "@playwright/test"
import { mockProfilePicturePreview, PROFILE_PICTURE_FILE_ID, type FileAnswer } from "./core"

/**
 * The shared profile header (Team A owns this file: Stories 1.9, 1.10; spec
 * F7-1). The header renders on `/` and `/account`, so Team B's specs call
 * these helpers instead of re-describing it: when Story 1.10 changes the
 * header (picture, upload button), Team A updates these in the same change
 * and Team B's specs keep passing.
 */

/** Shows a Profile Picture in the header (the picture id and its image); returns the image requests. */
export async function mockHeaderPicture(page: Page, fileId: number = PROFILE_PICTURE_FILE_ID, image: FileAnswer = {}): Promise<() => Request[]> {
  return mockProfilePicturePreview(page, fileId, image)
}

/**
 * The header's own Tab stops, between "Return to 1health" and the tabs, as
 * `role:name` (none yet: initials only until Story 1.10 adds the picture
 * control, which adds its stop here).
 */
export const HEADER_TAB_STOPS: readonly string[] = []

/** The app bar's Tab stops, in order, on both pages (the wordmark is never one). */
export const APP_BAR_TAB_STOPS: readonly string[] = ["a:Personal Profile", "a:Account", "a:Return to 1health"]

/** Describes the focused element as `role:name` (aria-label, else text). */
async function focusedStop(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return "body"
    const role = el.getAttribute("role") ?? el.tagName.toLowerCase()
    return `${role}:${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim()}`
  })
}

/**
 * Asserts the Tab order from the top of the page: app bar → header stops →
 * the selected tab, and that the wordmark is never focused (Stories 1.8,
 * 1.9, 7.1, 7.2). Call it right after the page loaded (the h1 is visible),
 * before anything was clicked or focused. Returns the stops it saw.
 */
export async function expectHeaderTabOrder(page: Page): Promise<string[]> {
  const selectedTab = page.getByRole("tab", { selected: true })
  await expect(selectedTab).toBeVisible()
  const tabName = ((await selectedTab.getAttribute("aria-label")) ?? (await selectedTab.textContent()) ?? "").trim()
  const expected = [...APP_BAR_TAB_STOPS, ...HEADER_TAB_STOPS, `tab:${tabName}`]
  const seen: string[] = []
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press("Tab")
    seen.push(await focusedStop(page))
  }
  expect(seen, "Tab order: app bar → header → selected tab").toEqual(expected)
  expect(seen.some((stop) => stop.endsWith(":1health"))).toBe(false)
  return seen
}
