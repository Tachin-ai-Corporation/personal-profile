/**
 * The only way data-derived links get an `href` (AD-11): the value is kept
 * only when its protocol is allowed, else `undefined` (render plain text).
 * Social links pass `["https:"]` (Story 3.7).
 */

export type SafeProtocol = "https:" | "mailto:" | "tel:"

const DEFAULT_PROTOCOLS: readonly SafeProtocol[] = ["https:", "mailto:", "tel:"]

export function safeHref(value: string | null | undefined, protocols: readonly SafeProtocol[] = DEFAULT_PROTOCOLS): string | undefined {
  const trimmed = (value ?? "").trim()
  let protocol: string
  try {
    // Not `URL.canParse`: older Safari and Chrome don't have it.
    protocol = new URL(trimmed).protocol
  } catch {
    return undefined
  }
  return (protocols as readonly string[]).includes(protocol) ? trimmed : undefined
}
