import { isProductionBuild } from "@/lib/shared/app-env"
import { BFF_PATHS } from "@/lib/shared/bff-contract"

/**
 * The client side of the portal hand-off (Story 7.3 prerequisite, F6-1).
 * Features build the URL here and pass it to `navigate({ external: "handoff", href })`;
 * the route `app/handoff/portal/route.ts` (Story 7.3) answers the 303.
 */

export type HandoffTarget =
  | { readonly to: "tenant"; readonly tenantId: number | string }
  | { readonly to: "create-org" }

/** The tenant id rule the route applies too (AD-22): 1–19 ASCII digits. */
export const TENANT_ID_PATTERN = /^\d{1,19}$/

/** A positive tenant id: a safe positive integer, or a 1–19 digit string that isn't all zeros. */
export function isTenantId(value: unknown): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0
  return typeof value === "string" && TENANT_ID_PATTERN.test(value) && /[1-9]/.test(value)
}

/**
 * `/handoff/portal?to=tenant&tenantId=<n>` or `/handoff/portal?to=create-org`.
 * A bad tenant id throws outside production builds and returns the bare
 * `/handoff/portal` in production (the route then sends the user to the
 * resolved portal URL).
 */
export function handoffHref(target: HandoffTarget): string {
  if (target.to === "create-org") return `${BFF_PATHS.handoffPortal}?to=create-org`
  if (!isTenantId(target.tenantId)) {
    if (!isProductionBuild()) throw new Error("handoffHref: tenantId must be a positive integer of at most 19 digits")
    return BFF_PATHS.handoffPortal
  }
  return `${BFF_PATHS.handoffPortal}?to=tenant&tenantId=${String(target.tenantId)}`
}

/** Whether `href` is the hand-off route (bare or with a query); `navigate()` follows nothing else as a hand-off. */
export function isHandoffHref(href: string): boolean {
  return href === BFF_PATHS.handoffPortal || href.startsWith(`${BFF_PATHS.handoffPortal}?`)
}
