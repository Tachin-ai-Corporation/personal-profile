import "server-only"

/** The one JSON content-type check (415 `UNSUPPORTED_MEDIA`), reused by every JSON route. */
export function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("Content-Type")
  return contentType !== null && /^application\/json\s*(;|$)/i.test(contentType)
}
