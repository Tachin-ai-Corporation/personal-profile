import "server-only"

import type { NextRequest } from "next/server"
import { getSession } from "@/lib/server/session"
import { applyNoStore } from "@/lib/server/cache-headers"

/**
 * Cookie read-back (AD-4).
 *
 * Re-reads the sealed cookie that `/launch` just set. If it unseals, redirect to
 * the profile page; if it did not stick (blocked in a frame, etc.), send the
 * explanatory `cookies` screen. Relative, fragment-free redirects keep the
 * original `#signature`. No token appears in the response body.
 */
export const dynamic = "force-dynamic"

const TABS = new Set(["contacts", "insurance", "medical"])

function see303(location: string): Response {
  const headers = new Headers()
  headers.set("Location", location)
  applyNoStore(headers)
  return new Response(null, { status: 303, headers })
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url)
  const tabParam = url.searchParams.get("tab")
  const tab = tabParam && TABS.has(tabParam) ? tabParam : "contacts"

  const session = await getSession()
  if (!session) {
    return see303("/launch-error?reason=cookies")
  }
  return see303(`/?tab=${tab}`)
}
