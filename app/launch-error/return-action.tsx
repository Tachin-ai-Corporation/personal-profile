"use client"

import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import type { LaunchErrorAction } from "@/lib/shared/messages"

/** Framing never changes during a page's life, so the store has no updates. */
const noopSubscribe = () => () => {}

/** Client snapshot: a cross-origin frame throws on `window.top`, which we treat as framed. */
function readFramed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * The launch-error primary action (FR-1, AD-5).
 *
 * - `new-tab` (the `cookies` fallback): always opens `PORTAL_URL` in a new tab.
 * - `return`: same-tab when top-level; when framed (`window.self !== window.top`)
 *   the sandboxed frame cannot navigate the top window, so it opens a new tab.
 *
 * The href is the constant `PORTAL_URL`, passed from the server component. No
 * `returnUrl`/`next` param is ever used. Framing is read with
 * `useSyncExternalStore` (server snapshot `false`) to avoid a hydration mismatch.
 */
export function ReturnAction({
  label,
  href,
  action,
}: {
  label: string
  href: string
  action: LaunchErrorAction
}) {
  const framed = useSyncExternalStore(noopSubscribe, readFramed, () => false)
  const newTab = action === "new-tab" || framed

  return (
    <Button asChild>
      {newTab ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <a href={href}>{label}</a>
      )}
    </Button>
  )
}
