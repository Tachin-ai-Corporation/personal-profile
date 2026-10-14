import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { PORTAL_ORIGIN } from "@/lib/server/env"
import { NO_STORE_HEADERS } from "@/lib/server/cache-headers"
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  isSessionAged,
  sealSession,
  unsealSession,
} from "@/lib/server/session"

/**
 * =============================================================================
 * proxy.ts — the Next 16 request interceptor (replaces `middleware.ts`)
 * =============================================================================
 *
 * Runs on the Node.js runtime (Next 16 forbids a route-segment runtime config
 * here and always runs the proxy on Node). It sets the AD-21 security headers on
 * EVERY response — app routes, 404s, static assets and `/api/**` alike — with a
 * fresh per-request CSP nonce, and forwards that nonce to the App Router via the
 * `x-nonce` request header so Next's own scripts carry it.
 *
 * It also redirects `/?lpl=` to `/launch` (AD-4) and records a top-level
 * navigation to `/` as user activity (AD-16, Story 1.6): a `GET /` with
 * `Sec-Fetch-Mode: navigate` and a session cookie re-seals `lastSeen = now`
 * (aged or unsealable → clear the cookie + 307 to `reason=expired`). This lives
 * here because a server component cannot set cookies. Prefetch and RSC requests
 * are not activity.
 * =============================================================================
 */

/** Generate a fresh, ≥128-bit, base64 nonce for each request (Node Web Crypto). */
function generateNonce(): string {
  const bytes = new Uint8Array(16) // 128 bits
  crypto.getRandomValues(bytes)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Build the per-request CSP string with the nonce and the fixed portal origin (AD-21). */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${PORTAL_ORIGIN}`,
    "upgrade-insecure-requests",
  ].join("; ")
}

/** Apply the full AD-21 header set to a response. */
function applySecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("Content-Security-Policy", buildCsp(nonce))
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("Referrer-Policy", "no-referrer")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
  // Note: X-Frame-Options is deliberately NOT set — framing is governed by
  // the CSP `frame-ancestors` directive alone (AD-5, AD-21).
  return res
}

/**
 * Launch surfaces that must never be cached (AD-18). Route handlers (`/launch`,
 * `/launch/verify`) also set these on their own responses; the page surfaces
 * (`/`, `/launch-error`) can only get them here. Static assets stay cacheable.
 */
const NO_STORE_PATHS = new Set(["/", "/launch", "/launch/verify", "/launch-error"])

/** Apply the no-store trio (AD-18). */
function applyNoStore(res: NextResponse): void {
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    res.headers.set(name, value)
  }
}

/** A top-level browser navigation to `/` (not a prefetch, not an RSC fetch). */
function isHomeNavigation(request: NextRequest): boolean {
  if (request.method !== "GET" || request.nextUrl.pathname !== "/") return false
  if (request.headers.get("sec-fetch-mode") !== "navigate") return false
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return false
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? ""
  return !/prefetch/i.test(purpose)
}

/**
 * The raw request `cookie` header with only the `__Host-pp_s=…` segment's value
 * replaced; every other byte (other cookies, their encoding, separators) is kept.
 */
function rewriteCookieHeader(request: NextRequest, sealedValue: string): string {
  const raw = request.headers.get("cookie") ?? ""
  const pattern = new RegExp(`(^|;\\s*)${SESSION_COOKIE_NAME}=[^;]*`)
  return raw.replace(pattern, (_match, prefix: string) => `${prefix}${SESSION_COOKIE_NAME}=${sealedValue}`)
}

type HomeActivity =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "renewed"; setCookie: string; sealedValue: string }

/** Evaluate the `/` navigate activity rule (Story 1.6). */
async function homeActivity(request: NextRequest): Promise<HomeActivity> {
  if (!isHomeNavigation(request)) return { kind: "none" }
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!raw) return { kind: "none" }
  const now = Date.now()
  const session = await unsealSession(raw)
  if (!session || isSessionAged(session, now)) return { kind: "expired" }
  const setCookie = await sealSession({ ...session, lastSeen: now })
  const sealedValue = setCookie.slice(SESSION_COOKIE_NAME.length + 1, setCookie.indexOf(";"))
  return { kind: "renewed", setCookie, sealedValue }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = generateNonce()
  const csp = buildCsp(nonce)

  // AD-4: a request to `/` carrying `lpl` is 307-redirected to `/launch` with the
  // full query string preserved, so `lpl` never reaches `app/page.tsx` or history.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.has("lpl")) {
    const target = request.nextUrl.clone()
    target.pathname = "/launch"
    const redirect = NextResponse.redirect(target, 307)
    applySecurityHeaders(redirect, nonce)
    // This is a `/` response whose Location carries the single-use lpl — no-store it (AD-18).
    applyNoStore(redirect)
    return redirect
  }

  // Story 1.6: a top-level navigation to `/` is user activity.
  const activity = await homeActivity(request)
  if (activity.kind === "expired") {
    const target = request.nextUrl.clone()
    target.pathname = "/launch-error"
    target.search = "?reason=expired"
    const redirect = NextResponse.redirect(target, 307)
    redirect.headers.append("Set-Cookie", clearSessionCookie())
    applySecurityHeaders(redirect, nonce)
    applyNoStore(redirect)
    return redirect
  }

  // Forward the nonce to the App Router. Next derives the nonce it stamps on its
  // own scripts from the request's `content-security-policy` header, so that must
  // be set; `x-nonce` is also forwarded for app code that needs the raw value.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("content-security-policy", csp)
  // Forward the renewed cookie so the page renders the new `lastSeen`.
  if (activity.kind === "renewed") {
    requestHeaders.set("cookie", rewriteCookieHeader(request, activity.sealedValue))
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  applySecurityHeaders(response, nonce)
  if (activity.kind === "renewed") response.headers.append("Set-Cookie", activity.setCookie)

  // AD-18: no-store on the launch surfaces and the guarded home page. These page
  // responses cannot set their own headers; route handlers set theirs too.
  if (NO_STORE_PATHS.has(request.nextUrl.pathname)) {
    applyNoStore(response)
  }

  return response
}

/** Match every path, including 404s and static assets, so headers are universal (AD-21). */
export const config = {
  matcher: ["/:path*"],
}
