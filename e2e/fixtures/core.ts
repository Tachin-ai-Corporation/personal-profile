import { expect, test as base, type Page, type Request, type Route } from "@playwright/test"
import { environmentConfig } from "../../lib/shared/environments"
import { sealedSessionCookie } from "../session-cookie"
import { mockContacts } from "./contacts"

/**
 * Shared e2e helpers (spec F6-3 split `e2e/fixtures.ts` per area): sign-in,
 * the generic proxy mock, `myself`, exit, theme, the shell defaults and the
 * mocks of endpoints both teams call (spec F7-1: `mockUserEdit`,
 * `mockFileDownload`, `mockProfilePicturePreview`). Area helpers live in their
 * area files (`header.ts`, `personal.ts`, `contacts.ts`, `addresses.ts`,
 * `insurance.ts` for Team A; `account.ts`, `mfa.ts`, `npi.ts`, `orgs.ts` for
 * Team B) and each page's defaults in `defaults-profile.ts` (A) /
 * `defaults-account.ts` (B); everything is re-exported by `./index.ts`, so
 * specs import from `./fixtures`. A story adds its mocks to its own area
 * file; a name that could clash carries its area prefix (`mockAddressSave`,
 * not `mockSave`), and `test/e2e-fixture-exports.test.ts` fails on a clash.
 */

/** The sealed session's environment is demo, so this is the embedded portal URL. */
export const PORTAL_URL = environmentConfig("demo").portalUrl

/**
 * The default `myself` (`mockMyself`, every page's defaults). FROZEN (spec
 * F7-1): both teams' specs assert on it ("Ann Lee", draft keys with id 42),
 * so never change or extend it. A spec that needs other values overrides per
 * test: `mockMyself(page, { body: { ...ANN, phoneNumber: "4155550199" } })`.
 */
export const ANN = Object.freeze({ id: 42, personId: 4242, firstName: "Ann", lastName: "Lee", username: "ann.lee" } as const)

const SIGN_IN_PATH = "/e2e-sign-in"

/**
 * Puts a sealed `__Host-pp_s` session on the page's context the way the BFF
 * does, with a `Set-Cookie` response (CDP refuses to add a `__Host-` cookie
 * directly). The real exchange is unit-tested.
 */
export async function signIn(page: Page): Promise<void> {
  const cookie = await sealedSessionCookie()
  await page.route(`**${SIGN_IN_PATH}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; HttpOnly; Secure; SameSite=Lax` },
      body: "signed in",
    }),
  )
  await page.goto(SIGN_IN_PATH)
  await page.unroute(`**${SIGN_IN_PATH}`)
}

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

/** A canned proxy answer: `body` (JSON, default `{}`) with `status` (default 200); 204 sends no body. */
export interface ProxyAnswer {
  readonly status?: number
  readonly body?: unknown
}

/** A fixed answer, or one computed per request (e.g. by query parameter). */
export type ProxyResponder = ProxyAnswer | ((request: Request) => ProxyAnswer)

/**
 * Mocks one 1health call through the BFF proxy. `glob` is relative to
 * `/api/1h/` (e.g. `"v2/type/key/Person"`, `"v2/public/npi/list?**"`); add
 * `?**` when the call has a query. Returns the requests it answered, in order.
 */
export async function mockProxy(page: Page, glob: string, answer: ProxyResponder): Promise<() => Request[]> {
  const seen: Request[] = []
  await page.route(`**/api/1h/${glob}`, (route) => {
    const request = route.request()
    seen.push(request)
    const { status = 200, body = {} } = typeof answer === "function" ? answer(request) : answer
    return status === 204 ? route.fulfill({ status }) : json(route, status, body)
  })
  return () => [...seen]
}

/** Mocks `GET /api/1h/v2/user/myself`; returns a request counter. */
export async function mockMyself(page: Page, answer: { status?: number; body?: unknown } = {}): Promise<() => number> {
  const requests = await mockProxy(page, "v2/user/myself", { status: answer.status ?? 200, body: answer.body ?? ANN })
  return () => requests().length
}

/** Mocks one `GET v2/type/key/{type}` (Stories 2.1, 3.1, 5.2); default: a type with no attributes. */
export async function mockTypeKey(page: Page, type: "Person" | "ContactPoint" | "Insurance", answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, `v2/type/key/${type}`, { status: answer.status ?? 200, body: answer.body ?? { boKey: type, attributes: [] } })
}

/** Mocks logout (204) and the portal page; returns the logout counter. */
export async function mockExit(page: Page): Promise<() => number> {
  let logouts = 0
  await page.route("**/api/session/logout", (route) => {
    logouts += 1
    return route.fulfill({ status: 204 })
  })
  const portalOrigin = new URL(PORTAL_URL).origin
  await page.route((url) => url.origin === portalOrigin, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>portal</title>portal" }))
  return () => logouts
}

/** `GET /api/pp/profile-picture-id` (Story 1.9; the header on both pages); default no picture. Not a proxy call. */
export async function mockProfilePictureId(page: Page, answer: ProxyAnswer = {}): Promise<void> {
  await page.route("**/api/pp/profile-picture-id", (route) => json(route, answer.status ?? 200, answer.body ?? { fileId: null }))
}

/**
 * The reads of the shell and the shared header, on both pages (spec F7-1):
 * `myself` (`ANN`), every Contact Point type (`[]`) and the picture id (no
 * picture). Foundation-owned; each page's defaults (`mockProfileDefaults`,
 * `mockAccountDefaults`) start with it, so a header read added here reaches
 * both teams at once.
 */
export async function mockShellDefaults(page: Page): Promise<void> {
  await mockMyself(page)
  await mockContacts(page)
  await mockProfilePictureId(page)
}

/** A 1×1 PNG: the default image answer of `mockFileDownload`. */
export const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")

/** An image answer: `body` bytes (default `PNG_1X1`) as `contentType` (default `image/png`) with `status` (default 200). */
export interface FileAnswer {
  readonly status?: number
  readonly body?: Buffer
  readonly contentType?: string
}

/**
 * `GET v2/file/{fileId}/download` (the proxy's `asImage` entry: Signature,
 * Profile Picture, insurance cards, org logos). `fileId` defaults to any id.
 * Shared by both teams. Returns the requests it answered, in order.
 */
export async function mockFileDownload(page: Page, fileId: number | "*" = "*", answer: FileAnswer = {}): Promise<() => Request[]> {
  const seen: Request[] = []
  await page.route(`**/api/1h/v2/file/${fileId}/download`, (route) => {
    seen.push(route.request())
    return route.fulfill({ status: answer.status ?? 200, contentType: answer.contentType ?? "image/png", body: answer.body ?? PNG_1X1 })
  })
  return () => [...seen]
}

/** The file id `mockProfilePicturePreview` answers with by default. */
export const PROFILE_PICTURE_FILE_ID = 9001

/**
 * The header's Profile Picture (shown on both pages): the picture id
 * (`/api/pp/profile-picture-id` → `{ fileId }`) and that file's image
 * (`mockFileDownload`). Story 1.10 (Team A) keeps this in step with how the
 * header loads the picture; Team B's specs call it, or Team A's
 * `mockHeaderPicture`, to show one on `/account`. Returns the image requests.
 */
export async function mockProfilePicturePreview(page: Page, fileId: number = PROFILE_PICTURE_FILE_ID, image: FileAnswer = {}): Promise<() => Request[]> {
  await mockProfilePictureId(page, { body: { fileId } })
  return mockFileDownload(page, fileId, image)
}

/** One `PUT v2/user/edit` the page sent: its JSON body. */
export type UserEditBody = Record<string, unknown>

/**
 * `PUT v2/user/edit`, shared by Personal information (Team A, Epic 2) and
 * Personal account settings (Team B, Stories 7.5/7.6). Default answer: 200
 * with `ANN` merged with the sent body (the updated user). Other methods on
 * the path fall through to earlier mocks (or the fail-fast guard). Returns
 * the bodies sent, in order.
 */
export async function mockUserEdit(page: Page, answer: ProxyResponder = {}): Promise<() => UserEditBody[]> {
  const bodies: UserEditBody[] = []
  await page.route("**/api/1h/v2/user/edit", (route) => {
    const request = route.request()
    if (request.method() !== "PUT") return route.fallback()
    const body = (request.postDataJSON() ?? {}) as UserEditBody
    bodies.push(body)
    const { status = 200, body: reply = { ...ANN, ...body } } = typeof answer === "function" ? answer(request) : answer
    return status === 204 ? route.fulfill({ status }) : json(route, status, reply)
  })
  return () => [...bodies]
}

/**
 * The fail-fast catch-all: every data call (`/api/1h/**` proxy, `/api/pp/**`
 * named ops, `/api/places/**`) no other mock answers gets 599
 * `{ errorCode: "E2E_UNMOCKED" }` and is recorded as `METHOD path?query`.
 * It is a context route, so it also covers popups and new pages, and it always
 * runs after the page's own mocks (Playwright tries page routes first).
 * The `test` below installs it for every test.
 */
export async function failOnUnmockedProxy(page: Page): Promise<() => string[]> {
  const unmocked: string[] = []
  await page.context().route("**/api/{1h,pp,places}/**", (route) => {
    const url = new URL(route.request().url())
    unmocked.push(`${route.request().method()} ${url.pathname}${url.search}`)
    return json(route, 599, { errorCode: "E2E_UNMOCKED", source: "proxy" })
  })
  return () => [...unmocked]
}

/**
 * `test` with the catch-all on (opt in by importing `test` from
 * `./fixtures` instead of `@playwright/test`): a test that lets any
 * `/api/1h`, `/api/pp` or `/api/places` call through unmocked fails at the
 * end, naming the calls.
 */
export const test = base.extend<{ unmockedProxyGuard: void }>({
  unmockedProxyGuard: [
    async ({ page }, use) => {
      const unmocked = await failOnUnmockedProxy(page)
      await use()
      expect(unmocked(), "unmocked /api/{1h,pp,places} calls (add a mock in e2e/fixtures/<area>.ts)").toEqual([])
    },
    { auto: true },
  ],
})

/**
 * Switches the page to the dark theme (class-based, D13). Reduced motion is
 * emulated first, so color transitions are near-instant (globals.css), and
 * contrast is never measured mid-transition.
 */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" })
  // Toggle, then wait two frames: even a 0.01 ms transition only lands on the next frame.
  await page.evaluate(
    (dark) =>
      new Promise<void>((resolve) => {
        document.documentElement.classList.toggle("dark", dark)
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
    theme === "dark",
  )
  // Then let every running animation (e.g. a dialog's fade-in) finish, so contrast is measured on final colors.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))))
}
