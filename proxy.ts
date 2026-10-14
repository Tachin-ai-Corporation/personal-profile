import { NextResponse, type NextRequest } from "next/server"
import { isLocalDev } from "@/lib/shared/app-env"
import { generateNonce, securityHeaders } from "@/lib/server/security/headers"
import { NO_STORE_HEADERS } from "@/lib/server/http/cache-headers"
import { canRenewLastSeen } from "@/lib/server/session/refresh"
import {
  clearSessionSetCookie,
  isSessionAged,
  readCookie,
  renewLastSeen,
  SESSION_COOKIE,
  unsealSession,
} from "@/lib/server/session/session"

/**
 * Next 16 request interceptor. Sets the AD-21 headers, with a fresh CSP nonce,
 * on every response (pages, 404s, `/api/**` and static assets).
 *
 * It does not redirect requests without a session: pages call
 * `requireSession()` themselves (spec 7.0a design note).
 *
 * Story 1.6 (AD-16): a top-level navigation to `/` or `/account` that carries
 * the session cookie is user activity. A valid session is re-sealed with
 * `lastSeen = now` (set on the response and forwarded to the page, so it
 * renders the new value); an unsealable or aged one is cleared with a 307 to
 * `/auth`. Within 55 s of token expiry nothing is re-sealed (race guard).
 * This lives here because a server component cannot set cookies.
 * Prefetch and RSC requests are not activity.
 */

const ACTIVITY_PAGES = new Set(["/", "/account"])

/** `/account/` is the same page as `/account`. */
const pagePath = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname)

/** A top-level browser navigation to an activity page (not a prefetch, not an RSC fetch). */
function isPageNavigation(request: NextRequest): boolean {
  if (request.method !== "GET" || !ACTIVITY_PAGES.has(pagePath(request.nextUrl.pathname))) return false
  if (request.headers.get("sec-fetch-mode") !== "navigate") return false
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return false
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? ""
  return !/prefetch/i.test(purpose)
}

type NavigationActivity =
  /** Not activity, or inside the race-guard window (pass through untouched). */
  | { readonly kind: "none" }
  | { readonly kind: "expired" }
  | { readonly kind: "renewed"; readonly setCookie: string; readonly seal: string }

async function navigationActivity(request: NextRequest): Promise<NavigationActivity> {
  if (!isPageNavigation(request)) return { kind: "none" }
  const raw = readCookie(request.headers.get("cookie"), SESSION_COOKIE)
  if (!raw) return { kind: "none" }
  try {
    const now = Date.now()
    const session = await unsealSession(raw)
    if (!session || isSessionAged(session, now)) return { kind: "expired" }
    // Race guard (as the BFF proxy): near token expiry a refresh in another tab
    // could rotate the tokens, and this re-seal would write the old ones back.
    if (!canRenewLastSeen(session, now)) return { kind: "none" }
    const setCookie = await renewLastSeen(session, now)
    return { kind: "renewed", setCookie, seal: setCookie.slice(SESSION_COOKIE.length + 1, setCookie.indexOf(";")) }
  } catch {
    // Misconfigured secrets: leave the request alone, the page's requireSession() decides.
    return { kind: "none" }
  }
}

/** The raw `Cookie` header with only the session segment's value replaced; every other byte is kept. */
function rewriteCookieHeader(raw: string, seal: string): string {
  return raw.replace(new RegExp(`(^|;\\s*)${SESSION_COOKIE}=[^;]*`), (_match, prefix: string) => `${prefix}${SESSION_COOKIE}=${seal}`)
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce()
  const headers = securityHeaders(nonce, isLocalDev())
  const activity = await navigationActivity(request)

  if (activity.kind === "expired") {
    const response = new NextResponse(null, { status: 307, headers: { Location: new URL("/auth", request.url).toString() } })
    response.headers.append("Set-Cookie", clearSessionSetCookie())
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    for (const [name, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(name, value)
    return response
  }

  // Next reads the nonce from the request CSP header and stamps its own scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"])
  if (activity.kind === "renewed") {
    requestHeaders.set("cookie", rewriteCookieHeader(request.headers.get("cookie") ?? "", activity.seal))
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  if (activity.kind === "renewed") response.headers.append("Set-Cookie", activity.setCookie)
  return response
}

export const config = {
  matcher: "/:path*",
}
