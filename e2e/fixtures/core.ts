import { expect, test as base, type Page, type Request, type Route } from "@playwright/test"
import { environmentConfig } from "../../lib/shared/environments"
import { sealedSessionCookie } from "../session-cookie"

/**
 * Shared e2e helpers (spec F6-3 split `e2e/fixtures.ts` per area): sign-in,
 * the generic proxy mock, `myself`, exit and theme. Area helpers live in
 * `contacts.ts`, `addresses.ts`, `insurance.ts`, `account.ts`, `mfa.ts`,
 * `npi.ts` and `orgs.ts`; everything is re-exported by `./index.ts`, so specs
 * import from `./fixtures`. A story adds its mocks to its own area file.
 */

/** The sealed session's environment is demo, so this is the embedded portal URL. */
export const PORTAL_URL = environmentConfig("demo").portalUrl

export const ANN = { id: 42, personId: 4242, firstName: "Ann", lastName: "Lee", username: "ann.lee" }

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
