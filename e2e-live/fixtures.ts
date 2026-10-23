import { existsSync } from "node:fs"
import { expect, test as base, type APIResponse, type Page } from "@playwright/test"
import { devAccessToken, devApi, devLaunchPayload, restoreTenant, type LiveApi } from "./live-auth"
import { PORTAL_SESSION_FILE, liveSettingsFrom, type LiveSettings } from "./live-env"

/**
 * Fixtures of the live suite. Each test signs in afresh: the one-time code
 * lives about a minute and is single use, and "Return to 1health" revokes
 * every token of the user.
 */

/** The upstream `myself` fields the specs compare the UI with. */
export interface LiveMyself {
  readonly id: number
  readonly firstName?: string | null
  readonly lastName?: string | null
  readonly username?: string | null
}

/** One upstream Contact Point (`v2/user/contact-point/list`). */
export interface LiveContactPoint {
  readonly id: number
  readonly value?: string | null
  readonly type?: string | null
}

export interface LiveOptions {
  /** Set by `playwright.live.config.ts` from `.env.live.local`. */
  live: LiveSettings
}

interface LiveFixtures {
  /** The dev data as the test user (for setup, comparison and cleanup only). */
  upstream: LiveApi
  /** The test user's upstream `myself`. */
  myself: LiveMyself
  /** Opens the app through a real launch: `/auth?lpl=<backend payload>` → `/?tab=contacts`. */
  liveLaunch: () => Promise<void>
  /** Fails the test when any `/api/*` call of the app answered 5xx. */
  serverErrorGuard: void
  /** Portal mode: writes the (possibly refreshed) app session back for the next test and run. */
  portalSessionKeeper: void
}

export const test = base.extend<LiveFixtures & LiveOptions>({
  live: [liveSettingsFrom({}), { option: true }],
  upstream: async ({ live, page }, provide) => {
    if (live.mode === "portal") {
      // No bearer token in portal mode: go through the app's own proxy on the page's cookie jar,
      // refreshing once on 401 TOKEN_EXPIRED as `callApi` does (the refresh rotates the session cookie).
      const send = async (call: () => Promise<APIResponse>): Promise<APIResponse> => {
        const response = await call()
        if (response.status() !== 401) return response
        const refreshed = await page.request.post("/api/session/refresh")
        return refreshed.ok() ? call() : response
      }
      await provide({
        get: (path, options) => send(() => page.request.get(`/api/1h/${path}`, options)),
        post: (path, options) => send(() => page.request.post(`/api/1h/${path}`, options)),
        delete: (path) => send(() => page.request.delete(`/api/1h/${path}`)),
      })
      return
    }
    if (live.missing.length > 0) throw new Error(`Missing ${live.missing.join(", ")}: add them to .env.live.local (see e2e-live/README.md).`)
    const signIn = await devAccessToken(live)
    const api = await devApi(signIn.accessToken)
    try {
      await provide(api)
    } finally {
      await api.dispose()
      await restoreTenant(signIn)
    }
  },
  myself: async ({ upstream }, provide) => {
    const response = await upstream.get("v2/user/myself")
    expect(response.ok(), `GET v2/user/myself answered ${response.status()}`).toBe(true)
    await provide((await response.json()) as LiveMyself)
  },
  liveLaunch: async ({ page, upstream, live }, provide) => {
    await provide(async () => {
      if (live.mode === "portal") {
        // The session from the portal launch (global setup) is already on the page.
        await page.goto("/?tab=contacts")
        await expect(page, "the portal session should still be signed in (rerun to sign in again)").toHaveURL(/\/\?tab=contacts$/, { timeout: 30_000 })
        return
      }
      const lpl = await devLaunchPayload(upstream, live.appId)
      await page.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
      await expect(page, "the launch should land on the profile (check the app server's dev credentials)").toHaveURL(/\/\?tab=contacts$/, {
        timeout: 30_000,
      })
    })
  },
  portalSessionKeeper: [
    async ({ live, page }, provide) => {
      await provide()
      // The exit test deletes the file after its logout: don't bring a revoked session back.
      if (live.mode === "portal" && existsSync(PORTAL_SESSION_FILE)) await page.context().storageState({ path: PORTAL_SESSION_FILE })
    },
    { auto: true },
  ],
  serverErrorGuard: [
    async ({ page }, provide) => {
      const failures: string[] = []
      page.on("response", (response) => {
        const url = new URL(response.url())
        if (url.pathname.startsWith("/api/") && response.status() >= 500) failures.push(`${response.request().method()} ${url.pathname} → ${response.status()}`)
      })
      await provide()
      expect(failures, "app /api calls that answered 5xx").toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** No Section on the page shows a load error or a no-access row. */
export async function expectNoLoadErrors(page: Page): Promise<void> {
  await expect(page.getByText(/Couldn't load/)).toHaveCount(0)
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0)
}

/** The Section by its `h2` (the region the Section chrome names after it). */
export function sectionByHeading(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true })
}

/** The shell toast that carries `text`. */
export function toastWith(page: Page, text: string) {
  return page.getByRole("region", { name: /Notifications/ }).locator("li").filter({ hasText: text })
}
