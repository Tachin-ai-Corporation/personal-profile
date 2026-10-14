import type { Page, Route } from "@playwright/test"
import { environmentConfig } from "../lib/shared/environments"
import { sealedSessionCookie } from "./session-cookie"

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

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

/** Mocks `GET /api/1h/v2/user/myself`; returns a request counter. */
export async function mockMyself(page: Page, answer: { status?: number; body?: unknown } = {}): Promise<() => number> {
  let count = 0
  await page.route("**/api/1h/v2/user/myself", (route) => {
    count += 1
    return json(route, answer.status ?? 200, answer.body ?? ANN)
  })
  return () => count
}

export type ContactAnswer = readonly Record<string, unknown>[] | { readonly status: number; readonly body: unknown }

/** Mocks the contact-point list per type; returns the types requested, in order. */
export async function mockContacts(page: Page, byType: Partial<Record<"Mobile" | "Landline" | "Email", ContactAnswer>> = {}): Promise<string[]> {
  const seen: string[] = []
  await page.route("**/api/1h/v2/user/contact-point/list?**", (route) => {
    const type = new URL(route.request().url()).searchParams.get("type") as "Mobile" | "Landline" | "Email"
    seen.push(type)
    const answer = byType[type] ?? []
    return "status" in answer ? json(route, answer.status, answer.body) : json(route, 200, answer)
  })
  return seen
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
}
