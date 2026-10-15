import "server-only"

import { DISABLED_MESSAGES } from "@/lib/shared/messages"
import { environmentConfig, environmentFromReferrer, type Environment } from "@/lib/shared/environments"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { withNoStore } from "@/lib/server/http/cache-headers"
import { SERVICE_DISABLED_RETRY_AFTER } from "@/lib/server/http/responses"
import { logRequest, newRequestId } from "@/lib/server/log"
import { ENVIRONMENT_COOKIE, parseEnvironmentCookie } from "@/lib/server/session/environment-cookie"
import { readCookie, SESSION_COOKIE, unsealSession } from "@/lib/server/session/session"

/**
 * The kill-switch screen (Stories 1.16, 7.2): root `proxy.ts` rewrites every
 * switched-off page, RSC and prefetch request to `app/disabled/route.ts`,
 * which answers it here with **503** (a page rewrite would render 200 in
 * Next 16). Static markup: no script, inline styles from the light theme
 * tokens of `app/globals.css` (a test keeps them equal), copy from
 * `DISABLED_MESSAGES`.
 */

export const DISABLED_ROUTE = "/disabled"

/** Set by `proxy.ts` on the rewrite: the switched-off page was `/auth` (its referrer may pick the link). */
export const DISABLED_FROM_HEADER = "x-pp-disabled-from"
export const DISABLED_FROM_AUTH = "auth"

/** Light-theme token values (`app/globals.css` `:root`), for a page that loads no stylesheet. */
export const DISABLED_SCREEN_TOKENS = {
  background: "#f4f7fa",
  foreground: "#202833",
  card: "#ffffff",
  mutedForeground: "#566373",
  primary: "#246b8f",
  primaryForeground: "#ffffff",
  border: "#e1e8ef",
  ring: "#246b8f",
  radius: "16px",
} as const

/** Dark-theme token values (`app/globals.css` `.dark`), applied with `prefers-color-scheme: dark`. */
export const DISABLED_SCREEN_DARK_TOKENS = {
  background: "#202833",
  foreground: "#e6ebf0",
  card: "#29333f",
  mutedForeground: "#aeb8c4",
  primary: "#246b8f",
  primaryForeground: "#ffffff",
  border: "#3a4552",
  ring: "#8fd8e6",
} as const

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** The full 503 document; `portalUrl` comes only from the environment map. */
export function disabledScreenHtml(portalUrl: string): string {
  const t = DISABLED_SCREEN_TOKENS
  const d = DISABLED_SCREEN_DARK_TOKENS
  const title = escapeHtml(DISABLED_MESSAGES.title)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:16px;background:${t.background};color:${t.foreground};font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
main{width:100%;max-width:28rem;background:${t.card};border:1px solid ${t.border};border-radius:${t.radius};padding:32px 24px;text-align:center}
h1{margin:0 0 8px;font-size:1.25rem;font-weight:600}
p{margin:0 0 24px;color:${t.mutedForeground};font-size:.875rem}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:9999px;background:${t.primary};color:${t.primaryForeground};font-weight:600;text-decoration:none}
a:focus-visible{outline:2px solid ${t.ring};outline-offset:2px}
@media (prefers-color-scheme: dark){
body{background:${d.background};color:${d.foreground}}
main{background:${d.card};border-color:${d.border}}
p{color:${d.mutedForeground}}
a{background:${d.primary};color:${d.primaryForeground}}
a:focus-visible{outline-color:${d.ring}}
}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${escapeHtml(DISABLED_MESSAGES.body)}</p>
<a href="${escapeHtml(portalUrl)}">${escapeHtml(DISABLED_MESSAGES.action)}</a>
</main>
</body>
</html>
`
}

/**
 * The environment whose portal "Go to 1health" opens. Never from a URL parameter.
 * - Switched-off `/auth`: as the `/auth` screen itself picks it (D2): the
 *   referrer, else the remembered `onehealth_environment` cookie, else prod.
 * - Any other page: the session's (sealed, even if aged), else the remembered
 *   cookie, else prod.
 */
export async function disabledScreenEnvironment(request: Request): Promise<Environment> {
  const cookies = request.headers.get("cookie")
  const remembered = parseEnvironmentCookie(readCookie(cookies, ENVIRONMENT_COOKIE))
  if (request.headers.get(DISABLED_FROM_HEADER) === DISABLED_FROM_AUTH) {
    return environmentFromReferrer(request.headers.get("referer") ?? "") ?? remembered ?? "prod"
  }
  let session = null
  try {
    session = await unsealSession(readCookie(cookies, SESSION_COOKIE))
  } catch {
    // Misconfigured secrets: fall through to the remembered environment.
  }
  if (session) return session.environment
  return remembered ?? "prod"
}

export interface DisabledScreenDeps {
  readonly env?: () => ServerEnv
  readonly now?: () => number
}

/**
 * Any method on `/disabled`: 503 with the disabled screen while a kill switch
 * is on, else 404 (the screen is never served to a working app). No-store.
 */
export function createDisabledScreenHandler(deps: DisabledScreenDeps = {}): (request: Request) => Promise<Response> {
  const getEnv = deps.env ?? serverEnv
  const now = deps.now ?? Date.now

  return async function handleDisabledScreen(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()
    const headers = withNoStore()
    headers.set("X-Content-Type-Options", "nosniff")

    let response: Response
    const env = getEnv()
    if (env.PP_DISABLED || env.ACCOUNT_DISABLED) {
      headers.set("Content-Type", "text/html; charset=utf-8")
      headers.set("Retry-After", SERVICE_DISABLED_RETRY_AFTER)
      const portalUrl = environmentConfig(await disabledScreenEnvironment(request)).portalUrl
      response = new Response(request.method === "HEAD" ? null : disabledScreenHtml(portalUrl), { status: 503, headers })
    } else {
      response = new Response(null, { status: 404, headers })
    }
    logRequest({ requestId, method: request.method, routeTemplate: DISABLED_ROUTE, status: response.status, durationMs: now() - started })
    return response
  }
}
