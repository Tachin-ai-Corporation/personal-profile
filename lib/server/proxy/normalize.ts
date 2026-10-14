import "server-only"

/**
 * AD-2 path normalization, run on the raw (still percent-encoded) path after
 * `/api/1h/`, before any matching. Returns the decoded segments, or `null`
 * for 400 `BAD_PATH`.
 */

const RAW_FORBIDDEN = /\/\/|%2f|%5c|%25/i
const SEGMENT_FORBIDDEN = /[/\\;%@:\s\u0000-\u001f\u007f]/

function isBadSegment(segment: string): boolean {
  return segment === "" || segment === "." || segment === ".." || SEGMENT_FORBIDDEN.test(segment)
}

export function normalizeProxyPath(rawPath: string): readonly string[] | null {
  if (rawPath === "" || RAW_FORBIDDEN.test(rawPath)) return null

  const rawSegments = rawPath.split("/")
  const segments: string[] = []
  for (const raw of rawSegments) {
    if (isBadSegment(raw.replace(/%[0-9a-f]{2}/gi, "x"))) return null
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      return null
    }
    if (isBadSegment(decoded)) return null
    segments.push(decoded)
  }
  return segments
}
