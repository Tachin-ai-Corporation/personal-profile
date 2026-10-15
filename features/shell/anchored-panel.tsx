"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { ACCOUNT_ANCHORS } from "./anchors"
import { AccountSectionPlaceholder } from "./placeholders"
import { SectionFrameProvider, useLandmarkCheck } from "./section-frame"
import { useHashAnchors } from "./use-hash-anchors"

export interface AnchoredPanelProps {
  /** The deep-link ids this panel owns (each a landmark inside `children`). */
  readonly anchors: readonly string[]
  /** Also focus the target's `h2` (Story 7.1). Default `false`. */
  readonly focusHeading?: boolean
  /** Sub-anchors → the frame that holds them. */
  readonly subAnchors?: Readonly<Record<string, string>>
  readonly className?: string
  readonly children: ReactNode
}

/**
 * A tab body that follows deep links to its own landmarks (F6-1): mounts
 * `useHashAnchors(anchors, …)` and provides the Section-ready signal
 * (`useSectionFrame`) to the landmarks inside, stacked 32 px apart. Mount it
 * only in the tab that owns the anchors.
 */
export function AnchoredPanel({ anchors, focusHeading = false, subAnchors, className, children }: AnchoredPanelProps) {
  const { frameReady } = useHashAnchors(anchors, { focusHeading, subAnchors })
  useLandmarkCheck(anchors, "AnchoredPanel")
  return (
    <SectionFrameProvider onReady={frameReady}>
      <div className={cn("flex min-w-0 flex-col gap-8", className)}>{children}</div>
    </SectionFrameProvider>
  )
}

export interface AccountPersonalPanelProps {
  /** The `account` Section, "Personal account settings" (Stories 7.4–7.6). */
  readonly account?: ReactNode
  /** The `authenticator` card, "Authenticator app" (Epic 8). */
  readonly authenticator?: ReactNode
}

/**
 * The `/account` Personal Account tab body (Story 7.1): Section `account`
 * then the `authenticator` card, with `#account` / `#authenticator` deep
 * links that also focus the `h2`. Missing slots show their placeholders.
 */
export function AccountPersonalPanel({ account, authenticator }: AccountPersonalPanelProps = {}) {
  return (
    <AnchoredPanel anchors={ACCOUNT_ANCHORS} focusHeading>
      {account ?? <AccountSectionPlaceholder id="account" />}
      {authenticator ?? <AccountSectionPlaceholder id="authenticator" />}
    </AnchoredPanel>
  )
}
