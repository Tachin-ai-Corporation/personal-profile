"use client"

import { Button } from "@/components/ui/button"
import { useIsFramed } from "@/features/shell/use-is-framed"
import type { LaunchErrorAction } from "@/lib/shared/messages"

/**
 * The launch-error primary action (FR-1, AD-5).
 *
 * - `new-tab` (the `cookies` fallback): always opens `PORTAL_URL` in a new tab.
 * - `return`: same-tab when top-level; when framed (`window.self !== window.top`)
 *   the sandboxed frame cannot navigate the top window, so it opens a new tab.
 *
 * The href is the constant `PORTAL_URL`, passed from the server component. No
 * `returnUrl`/`next` param is ever used. Framing is read with `useIsFramed()`
 * (server snapshot `false`) to avoid a hydration mismatch.
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
  const framed = useIsFramed()
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
