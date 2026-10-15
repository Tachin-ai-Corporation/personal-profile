import "server-only"

function encodeQuery(query: URLSearchParams): string {
  return [...query].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")
}

/**
 * The one upstream URL builder (AD-2), shared by the proxy and the named
 * operations: `origin(apiRoot) + "/api/" + segments.map(encodeURIComponent)`, never
 * `new URL(input, base)`. The result is re-parsed and must keep the origin and
 * decode back to the same path, else `null`.
 */
export function buildUpstreamUrl(apiRoot: string, segments: readonly string[], query: URLSearchParams = new URLSearchParams()): string | null {
  const path = `/api/${segments.map(encodeURIComponent).join("/")}`
  const search = encodeQuery(query)
  try {
    // Only the root's origin counts: a trailing slash (or any path) on it never breaks every call.
    const origin = new URL(apiRoot).origin
    const url = `${origin}${path}${search ? `?${search}` : ""}`
    const parsed = new URL(url)
    return parsed.origin === origin && parsed.pathname === path ? url : null
  } catch {
    return null
  }
}
