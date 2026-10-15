import "server-only"

/** AD-18: every BFF response overwrites caching headers with these. */
export const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
}

/** Upstream caching headers that never reach the browser. */
const DROPPED = ["Expires", "ETag", "Last-Modified"]

/** Returns `headers` with the no-store set applied (mutates and returns the same object). */
export function withNoStore(headers: Headers = new Headers()): Headers {
  for (const name of DROPPED) headers.delete(name)
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) headers.set(name, value)
  return headers
}
