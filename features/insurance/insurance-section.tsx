"use client"

import { Plus } from "lucide-react"
import { useMemo, useRef, useState, type JSX } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { PROFILE_SECTION_ICONS, PROFILE_SECTION_TONES, SectionHeader, sectionHeadingId, StateFrame, useMyself, useRegisterSection, useSectionFrame, type FrameState } from "@/features/shell"
import { keys, mapFetchError, type ApiResponseError, type InsurancePolicy } from "@/lib/api"
import { INSURANCE_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { insuranceActiveCount, sortInsurancePolicies } from "./format"
import { InsurancePolicyCard } from "./policy-card"
import { InsurancePolicyEditor } from "./policy-editor"
import { useInsuranceEditor } from "./use-insurance-editor"
import { useInsurancePolicyDelete } from "./use-policy-delete"

/** After Addresses (5) in the page's Section order. */
const INSURANCE_DISPLAY_ORDER = 6

/**
 * The shared `cards` skeleton as policy cards: one column, two cards (the
 * frame skeleton's own grid is the organizations grid).
 */
const SKELETON_AS_POLICIES = "[&_[data-slot=frame-skeleton]]:grid-cols-1 [&_[data-slot=frame-skeleton-card]:nth-child(n+3)]:hidden"

/** Once loading or ready, the cards are the containers (the frame keeps its border for the banner and no-access row). */
const FRAME_WITHOUT_CONTAINER = "overflow-visible rounded-none border-0 bg-transparent"

/**
 * The Insurance Section (Stories 5.1–5.5, FR28–FR31): one read of the
 * policy list (`keys.insurance()`), one card per policy (active first, then
 * Deleted), the card image viewer, the loading, empty, error and no-access
 * states, and the Add / Edit drawer ("Add insurance" in the header and on the
 * empty card, the card kebab's "Edit"), with its card images (5.3: uploaded
 * after the policy saves; a failed one gets "Retry upload" on the card; 5.4:
 * the offer to make the other Primary policy of the type Secondary), and the
 * kebab's "Delete" with its confirm (5.5). The
 * editor's state lives here, so the
 * Section's one registration is a guard-only participant (never in Save all,
 * the dirty count or drafts) whose dirtiness, validate, save and discard are
 * the editor's: the leave guard and page navigation protect unsaved edits.
 * The tab has no Section index.
 */
export function InsuranceSection(): JSX.Element {
  const read = useSWR<InsurancePolicy[] | undefined, ApiResponseError>(keys.insurance())
  const { myself } = useMyself()
  const { onReady } = useSectionFrame("insurance")
  const headingId = sectionHeadingId("insurance")

  // The editor reads the list too: Story 5.4's Primary conflict, and the refetch it awaits after a partial save.
  const { editor, refs } = useInsuranceEditor((fresh) => (fresh ? read.mutate(fresh, { revalidate: false }) : read.mutate()), read.data)
  const { addButton } = refs

  useRegisterSection({
    id: "insurance",
    label: SHELL_MESSAGES.profileTabInsurance,
    displayOrder: INSURANCE_DISPLAY_ORDER,
    saveAll: false,
    isDirty: editor.isDirty,
    validate: editor.validate,
    save: editor.save,
    discard: editor.discard,
  })

  const failure = read.data === undefined ? read.error : undefined
  // Each new failure is a new attempt, so a repeated failure is announced again (adjusted while rendering).
  const [attempt, setAttempt] = useState(0)
  const [seen, setSeen] = useState<unknown>(failure)
  if (seen !== failure) {
    setSeen(failure)
    if (failure) setAttempt((count) => count + 1)
  }

  const policies = useMemo(() => (read.data ? sortInsurancePolicies(read.data) : undefined), [read.data])

  // Story 5.5: with no active card left, focus lands on the empty card's "Add insurance", else the header's.
  const emptyCard = useRef<HTMLDivElement | null>(null)
  const remover = useInsurancePolicyDelete({
    policies,
    store: (next) => read.mutate(next, { revalidate: false }),
    addButtons: () => [emptyCard.current?.querySelector("button"), addButton.current],
    // An editor holding the removed policy closes (nothing left to save).
    onRemoved: (policyId) => {
      if (editor.open && editor.policy?.id === policyId) editor.discard()
    },
  })
  const state: FrameState = failure ? { error: mapFetchError("insurance", failure) } : policies ? "ready" : "loading"

  return (
    <section id="insurance" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader
        id="insurance"
        icon={{ icon: PROFILE_SECTION_ICONS.insurance, tone: PROFILE_SECTION_TONES.insurance }}
        title={SHELL_MESSAGES.profileTabInsurance}
        count={policies ? insuranceActiveCount(policies) : undefined}
        editing={false}
        className="mb-2"
        // Only once the list is there (not while loading, failed or without access).
        actions={
          state !== "ready" ? undefined : (
          <Button ref={addButton} type="button" variant="outline" size="touch" onClick={editor.openAdd}>
            <Plus aria-hidden="true" />
            {INSURANCE_MESSAGES.addInsurance}
          </Button>
          )
        }
      />
      <StateFrame
        state={state}
        skeleton="cards"
        loadError={{ kind: "section", sectionId: "insurance" }}
        level="section"
        // Retry revalidates only the policy list.
        onRetry={() => void read.mutate()}
        attempt={attempt}
        onReady={onReady}
        className={state === "loading" ? `${FRAME_WITHOUT_CONTAINER} ${SKELETON_AS_POLICIES}` : state === "ready" ? FRAME_WITHOUT_CONTAINER : undefined}
      >
        {policies && policies.length === 0 ? (
          <div ref={emptyCard}>
            <EmptyState variant="card" message={INSURANCE_MESSAGES.emptyMessage} action={{ label: INSURANCE_MESSAGES.addInsurance, onClick: editor.openAdd }} />
          </div>
        ) : null}
        {policies && policies.length > 0 ? (
          <div data-slot="insurance-cards" className="animate-section-enter flex flex-col gap-4">
            {policies.map((policy, index) => (
              <InsurancePolicyCard
                key={policy.id === null ? `none-${index}` : `id-${policy.id}`}
                policy={policy}
                myself={myself}
                onEdit={() => editor.openEdit(policy)}
                onDelete={() => remover.open(policy)}
                deleteDisabledReason={policy.id !== null && remover.isDeleting(policy.id) ? INSURANCE_MESSAGES.deleting : undefined}
                kebabRef={policy.id === null ? undefined : remover.kebabRef(policy.id)}
                onCardUploaded={() => void read.mutate()}
              />
            ))}
          </div>
        ) : null}
      </StateFrame>
      <InsurancePolicyEditor editor={editor} refs={refs} />
      <ConfirmDialog {...remover.dialog} />
    </section>
  )
}
