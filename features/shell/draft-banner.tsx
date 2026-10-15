"use client"

import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { COMMON_MESSAGES, DRAFT_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { DraftCompare } from "./draft-compare"
import { useSectionDraft } from "./draft-provider"
import { sectionHeadingId, type SectionId } from "./nav-types"

export interface SectionDraftNoticeProps {
  readonly sectionId: SectionId
  readonly className?: string
}

/** After a choice the banner unmounts: focus goes to the Section `h2`, never to `<body>`. */
function focusHeading(sectionId: SectionId): void {
  document.getElementById(sectionHeadingId(sectionId))?.focus()
}

/**
 * A Section's stored-draft slot (Story 1.15; UX-DR40, UX-DR41), rendered by
 * `SectionContainer` at the top of the Section's table container:
 *
 * Both banner sentences are `role="status"` (InlineBanner info), so they are
 * announced when they appear; every choice button is described by the
 * Section heading.
 *
 * - restore: info banner "You have unsaved changes from your last visit."
 *   with "Restore" (edit view with the draft) and "Discard" (draft deleted,
 *   read view);
 * - conflict: info banner "This section changed since your draft. …", the
 *   compare, then "Use current" (secondary) and "Keep mine" (primary),
 *   right-aligned.
 *
 * Nothing outside a `DraftsProvider`, while the Section's data loads or
 * after its read failed.
 */
export function SectionDraftNotice({ sectionId, className }: SectionDraftNoticeProps) {
  const draft = useSectionDraft(sectionId)
  const conflictId = `${sectionId}-draft-conflict`
  // Each choice is described by the Section's name ("Restore", "Phone").
  const headingId = sectionHeadingId(sectionId)
  if (draft.kind === "none") return null

  const choose = (action: () => void) => () => {
    action()
    focusHeading(sectionId)
  }

  if (draft.kind === "restore") {
    return (
      <InlineBanner
        variant="info"
        data-slot="draft-restore"
        className={cn("border-border rounded-t-md border-b", className)}
        action={
          <div className="flex items-center gap-1">
            <Button type="button" variant="link" size="touch" className="px-2" onClick={choose(draft.restore)} aria-describedby={headingId}>
              {COMMON_MESSAGES.restore}
            </Button>
            <Button type="button" variant="link" size="touch" className="px-2" onClick={choose(draft.discard)} aria-describedby={headingId}>
              {COMMON_MESSAGES.discard}
            </Button>
          </div>
        }
      >
        {DRAFT_MESSAGES.restoreBody}
      </InlineBanner>
    )
  }

  return (
    <div data-slot="draft-conflict" className={cn("border-border flex flex-col border-b", className)}>
      <InlineBanner id={conflictId} variant="info" className="rounded-t-md">
        {DRAFT_MESSAGES.conflictBody}
      </InlineBanner>
      {/* Named "{Section} This section changed since your draft. …", distinct from the Section's own table. */}
      <DraftCompare rows={draft.rows} labelledBy={`${headingId} ${conflictId}`} />
      <div className="border-border flex flex-wrap justify-end gap-2 border-t px-3 py-3">
        <Button type="button" variant="secondary" size="touch" onClick={choose(draft.useCurrent)} aria-describedby={headingId}>
          {DRAFT_MESSAGES.useCurrent}
        </Button>
        <Button type="button" size="touch" onClick={choose(draft.keepMine)} aria-describedby={headingId}>
          {DRAFT_MESSAGES.keepMine}
        </Button>
      </div>
    </div>
  )
}
