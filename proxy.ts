import { NextResponse, type NextRequest } from "next/server"
import { isLocalDev } from "@/lib/shared/app-env"
import { generateNonce, securityHeaders } from "@/lib/server/security/headers"

/**
 * Next 16 request interceptor. Sets the AD-21 headers, with a fresh CSP nonce,
 * on every response (pages, 404s, `/api/**` and static assets).
 *
 * It does not redirect requests without a session: pages call
 * `requireSession()` themselves (spec 7.0a design note).
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const headers = securityHeaders(nonce, isLocalDev())

  // Next reads the nonce from the request CSP header and stamps its own scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"])

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  return response
}

export const config = {
  matcher: "/:path*",
}
