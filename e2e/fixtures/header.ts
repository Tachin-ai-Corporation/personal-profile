import { expect, type Page, type Request } from "@playwright/test"
import { json, mockProfilePicture, PROFILE_PICTURE_FILE_ID, type FileAnswer, type ProxyAnswer } from "./core"

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
 * composition nor any Team B file changes; Story 1.10 added the avatar stop to
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
 * tabs, as `role:name`: the avatar button on `/` (Story 1.10), none on
 * `/account` (see the decision above).
 */
export const HEADER_TAB_STOPS: Readonly<Record<HeaderPage, readonly string[]>> = {
  profile: ["button:Change profile picture"],
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

/** One picture upload the page sent (Story 1.10): its single multipart part. */
export interface PictureUpload {
  /** The part's field name (always `file`). */
  readonly part: string
  /** The part's file name (`<sanitized base>.jpg`). */
  readonly fileName: string
  readonly contentType: string
  readonly bytes: Buffer
  /** How many parts the body had. */
  readonly parts: number
  /** The request's query string (always empty). */
  readonly search: string
}

/** Splits a `multipart/form-data` body into its parts (name, file name, type, bytes). */
function multipartParts(body: Buffer, contentType: string): Omit<PictureUpload, "parts" | "search">[] {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)
  if (!boundary) return []
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`)
  const parts: Omit<PictureUpload, "parts" | "search">[] = []
  let start = body.indexOf(delimiter)
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length)
    if (next === -1) break
    const chunk = body.subarray(start + delimiter.length + 2, next - 2)
    const headerEnd = chunk.indexOf("\r\n\r\n")
    const headers = chunk.subarray(0, headerEnd).toString("utf8")
    parts.push({
      part: /name="([^"]*)"/.exec(headers)?.[1] ?? "",
      fileName: /filename="([^"]*)"/.exec(headers)?.[1] ?? "",
      contentType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? "",
      bytes: chunk.subarray(headerEnd + 4),
    })
    start = next
  }
  return parts
}

/**
 * The Profile Picture upload (`POST v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload`,
 * Story 1.10): answers `answer` (default 200 `{ id: 9002 }`, or a function of
 * the attempt number from 1) and records each body's parts.
 */
export async function mockPictureUpload(page: Page, answer: ProxyAnswer | ((attempt: number) => ProxyAnswer | "abort") = {}): Promise<() => PictureUpload[]> {
  const uploads: PictureUpload[] = []
  await page.route("**/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload**", (route) => {
    const request = route.request()
    const contentType = request.headers()["content-type"] ?? ""
    const parts = multipartParts(request.postDataBuffer() ?? Buffer.alloc(0), contentType)
    uploads.push({ ...(parts[0] ?? { part: "", fileName: "", contentType: "", bytes: Buffer.alloc(0) }), parts: parts.length, search: new URL(request.url()).search })
    const result = typeof answer === "function" ? answer(uploads.length) : answer
    if (result === "abort") return route.abort("connectionfailed")
    return json(route, result.status ?? 200, result.body ?? { id: 9002 })
  })
  return () => [...uploads]
}

/**
 * The old picture's delete (`DELETE /api/pp/file/{fileId}`, the named op;
 * Story 1.10): answers `status` (default 204). Returns the deleted ids, in order.
 */
export async function mockPictureDelete(page: Page, status = 204): Promise<() => string[]> {
  const deleted: string[] = []
  await page.route("**/api/pp/file/*", (route) => {
    const request = route.request()
    if (request.method() !== "DELETE") return route.fallback()
    deleted.push(new URL(request.url()).pathname.split("/").pop() ?? "")
    return status === 204 ? route.fulfill({ status }) : json(route, status, { errorCode: "NO_FILE", source: "proxy" })
  })
  return () => [...deleted]
}

/**
 * The picture id from a live value (Story 1.10): every read answers
 * `{ fileId: current() }`, so the header, the dialog's read before the upload
 * and the one after it see the picture the test has at that moment. Returns
 * the read count.
 */
export async function mockPictureIdFrom(page: Page, current: () => number | null): Promise<() => number> {
  let reads = 0
  await page.route("**/api/pp/profile-picture-id", (route) => {
    reads += 1
    return json(route, 200, { fileId: current() })
  })
  return () => reads
}
