"use client"

import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { PROFILE_SECTIONS, SECTION_COLUMNS, SIGNATURE_ANCHOR, type ProfileSectionId } from "./anchors"
import { SectionLandmark } from "./section-landmark"
import { useSectionFrame } from "./section-frame"
import { StateFrame, type SkeletonVariant } from "./state-frame"

/**
 * The placeholders a page shows until a feature story fills the slot (F6-1):
 * each is the real landmark (or tab body) with its `StateFrame` in the
 * loading state, so deep-link anchors, headings and the Section menu work
 * before the feature exists. Feature stubs (`features/<id>/index.ts`) render
 * these until their story replaces them.
 */

/** Placeholder frames have nothing to retry until their feature gives them data. */
const noRetry = (): void => undefined

/** The `#signature` deep-link target inside Personal information while it loads. */
function SignaturePlaceholder() {
  return (
    <div id={SIGNATURE_ANCHOR} role="group" aria-label={SHELL_MESSAGES.signature} className="flex h-11 items-center gap-4 border-t px-3">
      <span className="text-muted-foreground w-24 shrink-0 text-body-sm">{SHELL_MESSAGES.signature}</span>
      <span aria-hidden="true" className="bg-muted h-3 min-w-0 flex-1 animate-pulse rounded-sm motion-reduce:animate-none" />
    </div>
  )
}

export type ProfilePlaceholderId = ProfileSectionId | "insurance"

const PROFILE_TITLES: Readonly<Record<ProfilePlaceholderId, string>> = {
  ...(Object.fromEntries(PROFILE_SECTIONS.map((section) => [section.id, section.label])) as Record<ProfileSectionId, string>),
  insurance: SHELL_MESSAGES.profileTabInsurance,
}

export interface ProfileSectionPlaceholderProps {
  readonly id: ProfilePlaceholderId
}

/** A `/` Section in its loading frame (table skeleton with the Section's real column headers). */
export function ProfileSectionPlaceholder({ id }: ProfileSectionPlaceholderProps) {
  const { onReady } = useSectionFrame(id)
  return (
    <SectionLandmark id={id} title={PROFILE_TITLES[id]}>
      <StateFrame
        state="loading"
        skeleton="table"
        columns={SECTION_COLUMNS[id]}
        loadError={{ kind: "section", sectionId: id }}
        level="section"
        onRetry={noRetry}
        onReady={onReady}
        anchors={id === "personal" ? <SignaturePlaceholder /> : undefined}
      />
    </SectionLandmark>
  )
}

export type AccountPlaceholderId = "account" | "authenticator"

const ACCOUNT_PLACEHOLDERS: Readonly<Record<AccountPlaceholderId, { readonly title: string; readonly skeleton: SkeletonVariant }>> = {
  account: { title: SHELL_MESSAGES.accountSectionHeading, skeleton: "kv" },
  authenticator: { title: SHELL_MESSAGES.authenticatorHeading, skeleton: "tiles" },
}

export interface AccountSectionPlaceholderProps {
  readonly id: AccountPlaceholderId
}

/** An `/account` Personal Account container (`account` key/value, `authenticator` tiles) in its loading frame. */
export function AccountSectionPlaceholder({ id }: AccountSectionPlaceholderProps) {
  const { onReady } = useSectionFrame(id)
  const { title, skeleton } = ACCOUNT_PLACEHOLDERS[id]
  return (
    <SectionLandmark id={id} title={title}>
      <StateFrame state="loading" skeleton={skeleton} loadError={{ kind: "page" }} level="section" onRetry={noRetry} onReady={onReady} />
    </SectionLandmark>
  )
}

export type AccountTabPlaceholderId = "provider" | "organizations"

const TAB_SKELETONS: Readonly<Record<AccountTabPlaceholderId, SkeletonVariant>> = { provider: "bars", organizations: "cards" }

export interface AccountTabPlaceholderProps {
  readonly tab: AccountTabPlaceholderId
}

/** An `/account` tab body (Provider: input bars; My Organizations: card grid) in its loading frame. */
export function AccountTabPlaceholder({ tab }: AccountTabPlaceholderProps) {
  return (
    <StateFrame
      state="loading"
      skeleton={TAB_SKELETONS[tab]}
      barWidth="wide"
      loadError={{ kind: "page" }}
      level="tab"
      onRetry={noRetry}
    />
  )
}
