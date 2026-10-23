import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname } from "node:path"
import { chromium, type FullConfig } from "@playwright/test"
import { DEV, PORTAL_SESSION_FILE, type LiveSettings } from "./live-env"

/**
 * Portal mode (`LIVE_PORTAL_LOGIN=1`): for when no plain patient test user
 * exists. A visible browser opens the dev portal with `?openApp=<appId>`; a
 * person signs in with their own account, from the personal account. When
 * the portal launches the app (it navigates to the app URL with `?lpl=`),
 * the setup takes that one-time payload before it reaches the deployed app,
 * launches the target app with it instead, and saves the app session for
 * every test. The payload lives about a minute, so nothing waits in between.
 */

const SIGN_IN_TIMEOUT_MS = 5 * 60_000
/** A saved session younger than this is tried before asking for a new sign-in (the upstream token lasts about an hour). */
const REUSE_MAX_AGE_MS = 45 * 60_000

export default async function globalSetup(config: FullConfig): Promise<void> {
  const { baseURL, live } = config.projects[0].use as { baseURL?: string; live?: LiveSettings }
  if (live?.mode !== "portal" || !baseURL) return
  const target = new URL(baseURL)

  if (existsSync(PORTAL_SESSION_FILE) && Date.now() - statSync(PORTAL_SESSION_FILE).mtimeMs < REUSE_MAX_AGE_MS) {
    const headless = await chromium.launch()
    try {
      const context = await headless.newContext({ baseURL, storageState: PORTAL_SESSION_FILE })
      // A stale access token is renewed like the app does; the rotated cookie is saved back.
      await context.request.post("/api/session/refresh")
      const page = await context.newPage()
      await page.goto("/?tab=contacts")
      if (new URL(page.url()).pathname === "/") {
        await context.storageState({ path: PORTAL_SESSION_FILE })
        console.log("\n[live] Reusing the saved portal session.\n")
        return
      }
    } finally {
      await headless.close()
    }
  }

  const browser = await chromium.launch({ headless: false })
  try {
    const portal = await browser.newContext()
    let resolveLpl: (lpl: string) => void = () => {}
    const captured = new Promise<string>((resolve) => {
      resolveLpl = resolve
    })
    // The portal opens the app's registered URL (`…/auth?lpl=`), in this tab or a new one.
    await portal.route(
      (url) => url.pathname === "/auth" && url.searchParams.has("lpl") && url.origin !== target.origin,
      async (route) => {
        resolveLpl(new URL(route.request().url()).searchParams.get("lpl") ?? "")
        await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Launch caught</title><p>Launch caught: the tests take it from here. You can leave this window.</p>" })
      },
    )
    const page = await portal.newPage()
    await page.goto(`${DEV.portalUrl}/login?openApp=${encodeURIComponent(live.appId)}`)
    console.log(
      `\n[live] Sign in to the 1health dev portal in the browser window, from your PERSONAL account. ` +
        `The portal then launches app ${live.appId} and the tests take over (waiting up to 5 minutes).\n`,
    )
    let timer: NodeJS.Timeout | undefined
    const lpl = await Promise.race([
      captured,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("No app launch from the dev portal within 5 minutes.")), SIGN_IN_TIMEOUT_MS)
      }),
    ]).finally(() => clearTimeout(timer))
    if (!lpl) throw new Error("The portal launch carried no lpl.")

    const app = await browser.newContext({ baseURL })
    const appPage = await app.newPage()
    await appPage.goto(`/auth?lpl=${encodeURIComponent(lpl)}`)
    try {
      await appPage.waitForURL((url) => url.pathname === "/" && url.searchParams.get("tab") === "contacts", { timeout: 30_000 })
    } catch {
      const shown = (await appPage.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300)
      throw new Error(
        `The launch did not reach the profile; /auth shows: "${shown}". A launch from an organization (not the personal account) is refused as WRONG_TENANT.`,
      )
    }
    mkdirSync(dirname(PORTAL_SESSION_FILE), { recursive: true })
    await app.storageState({ path: PORTAL_SESSION_FILE })
  } finally {
    await browser.close()
  }
}
