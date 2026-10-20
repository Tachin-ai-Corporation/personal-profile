"use client"

import { useMemo, useState, type JSX } from "react"
import useSWR from "swr"
import { EmptyState } from "@/components/ui/empty-state"
import { SectionHeader, sectionHeadingId, StateFrame, useMyself, useRegisterSection, useSectionFrame, type FrameState } from "@/features/shell"
import { keys, mapFetchError, type ApiResponseError, type InsurancePolicy } from "@/lib/api"
import { INSURANCE_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { insuranceActiveCount, sortInsurancePolicies } from "./format"
import { InsurancePolicyCard } from "./policy-card"

/** After Addresses (5) in the page's Section order. */
const INSURANCE_DISPLAY_ORDER = 6

const noop = (): void => undefined

/**
 * The shared `cards` skeleton as policy cards: one column, two cards (the
 * frame skeleton's own grid is the organizations grid).
 */
const SKELETON_AS_POLICIES = "[&_[data-slot=frame-skeleton]]:grid-cols-1 [&_[data-slot=frame-skeleton-card]:nth-child(n+3)]:hidden"

/** Once loading or ready, the cards are the containers (the frame keeps its border for the banner and no-access row). */
const FRAME_WITHOUT_CONTAINER = "overflow-visible rounded-none border-0 bg-transparent"

/**
 * The Insurance Section (Story 5.1, FR28, FR31): one read of the policy list
 * (`keys.insurance()`), one card per policy (active first, then Deleted), the
 * card image viewer, and the loading, empty, error and no-access states. It
 * registers as a guard-only participant (never in Save all, the dirty count
 * or drafts); the Story 5.2 editor supplies its validate, save and discard.
 * "Add insurance" and the card kebab stay hidden until Stories 5.2 and 5.5
 * add what they open (decision 1A). The tab has no Section index.
 */
export function InsuranceSection(): JSX.Element {
  const read = useSWR<InsurancePolicy[] | undefined, ApiResponseError>(keys.insurance())
  const { myself } = useMyself()
  const { onReady } = useSectionFrame("insurance")
  const headingId = sectionHeadingId("insurance")

  useRegisterSection({
    id: "insurance",
    label: SHELL_MESSAGES.profileTabInsurance,
    displayOrder: INSURANCE_DISPLAY_ORDER,
    saveAll: false,
    isDirty: false,
    discard: noop,
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
  const state: FrameState = failure ? { error: mapFetchError("insurance", failure) } : policies ? "ready" : "loading"

  return (
    <section id="insurance" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader
        id="insurance"
        title={SHELL_MESSAGES.profileTabInsurance}
        count={policies ? insuranceActiveCount(policies) : undefined}
        editing={false}
        className="mb-2"
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
        {policies && policies.length === 0 ? <EmptyState variant="card" message={INSURANCE_MESSAGES.emptyMessage} /> : null}
        {policies && policies.length > 0 ? (
          <div data-slot="insurance-cards" className="flex flex-col gap-4">
            {policies.map((policy, index) => (
              <InsurancePolicyCard key={policy.id === null ? `none-${index}` : `id-${policy.id}`} policy={policy} myself={myself} />
            ))}
          </div>
        ) : null}
      </StateFrame>
    </section>
  )
}
