import { expect, type Page, type Request } from "@playwright/test"
import { mockProfilePicture, PROFILE_PICTURE_FILE_ID, type FileAnswer } from "./core"

/**
 * The shared profile header (Team A owns this file: Stories 1.9, 1.10; spec
 * F7-1). The header renders on `/` and `/account`, so Team B's specs call
 * these helpers instead of re-describing it: when Story 1.10 changes the
 * header (picture, upload button), Team A updates these in the same change
 * and Team B's specs keep passing.
 *
 * Decision 2026-10-14 (human): the avatar becomes a button **only on `/`**;
 * on `/account` it stays a non-interactive image (no Tab stop). The header
 * decides by itself with `useCurrentPage()`, so neither the `/account`
 * composition nor any Team B file changes; Story 1.10 adds the avatar stop to
 * `HEADER_TAB_STOPS.profile` only.
 */

/** Shows a Profile Picture in the header (the picture id and its preview image); returns the image requests. */
export async function mockHeaderPicture(page: Page, fileId: number = PROFILE_PICTURE_FILE_ID, image: FileAnswer = {}): Promise<() => Request[]> {
  return mockProfilePicture(page, fileId, image)
}

/** The header's pages: `/` (`profile`) and `/account` (`account`). */
export type HeaderPage = "profile" | "account"

/**
 * The header's own Tab stops per page, between "Return to 1health" and the
 * tabs, as `role:name`. None yet on either page (initials only); Story 1.10
 * adds the avatar button's stop to `profile` only (see the decision above).
 */
export const HEADER_TAB_STOPS: Readonly<Record<HeaderPage, readonly string[]>> = {
  profile: [],
  account: [],
}

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

/** The header page of a URL: `/account…` → `account`, anything else (`/`, fixture pages) → `profile`. */
export function headerPageOf(url: string): HeaderPage {
  return /^\/account(\/|$)/.test(new URL(url).pathname) ? "account" : "profile"
}

/**
 * Asserts the Tab order from the top of the page: app bar → that page's
 * header stops (picked by `page.url()`) → the selected tab, and that the
 * wordmark is never focused (Stories 1.8, 1.9, 1.10, 7.1, 7.2). Call it right
 * after the page loaded (the h1 is visible), before anything was clicked or
 * focused. Returns the stops it saw.
 */
export async function expectHeaderTabOrder(page: Page): Promise<string[]> {
  const selectedTab = page.getByRole("tab", { selected: true })
  await expect(selectedTab).toBeVisible()
  const tabName = ((await selectedTab.getAttribute("aria-label")) ?? (await selectedTab.textContent()) ?? "").trim()
  const expected = [...APP_BAR_TAB_STOPS, ...HEADER_TAB_STOPS[headerPageOf(page.url())], `tab:${tabName}`]
  const seen: string[] = []
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press("Tab")
    seen.push(await focusedStop(page))
  }
  expect(seen, "Tab order: app bar → header → selected tab").toEqual(expected)
  expect(seen.some((stop) => stop.endsWith(":1health"))).toBe(false)
  return seen
}
