import { useSyncExternalStore } from "react"
import type { Environment } from "@/lib/shared/environments"

/**
 * The environment a session-less screen SHOWS (D2, D4): its labels and its
 * "Go to 1health" link. Display only — no request ever carries it; `/api/token`
 * detects the environment by key.
 *
 * Order: the referrer (`demo.1health` → demo, `app.1health` → prod), then the
 * remembered `onehealth_environment` value the server wrapper passed in (the
 * cookie is httpOnly; the client never reads cookies itself).
 */

/** The environment a referrer URL points at, or `null`. */
export function environmentFromReferrer(referrer: string): Environment | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname
    if (host.includes("demo.1health")) return "demo"
    if (host.includes("app.1health")) return "prod"
  } catch {
    // Not a URL.
  }
  return null
}

const noopSubscribe = () => () => {}

function readReferrer(): Environment | null {
  return typeof document === "undefined" ? null : environmentFromReferrer(document.referrer)
}

const serverSnapshot = () => null

/**
 * The referrer's environment. The server snapshot is `null`, so server and
 * first client render agree; the referrer never changes during a page's life.
 */
export function useReferrerEnvironment(): Environment | null {
  return useSyncExternalStore(noopSubscribe, readReferrer, serverSnapshot)
}
