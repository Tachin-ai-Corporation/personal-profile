"use client"

import { useState } from "react"
import {
  KeyValueTable,
  SIGNATURE_ANCHOR,
  SectionLandmark,
  SignatureThumb,
  StateFrame,
  sectionHeadingId,
  useClaimMyselfError,
  useMyself,
  useSectionFrame,
  type FrameState,
  type KeyValueRow,
} from "@/features/shell"
import { mapFetchError, type Myself } from "@/lib/api"
import { wireToDisplayDate } from "@/lib/shared/dates"
import { COMMON_MESSAGES, FIELD_MESSAGES, PERSON_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { usePersonOptions } from "./use-person-options"

/** At most this many digits may show in a Masked SSN (the last four). */
const MASKED_SSN_MAX_DIGITS = 4

/**
 * `true` only for a backend mask such as `***-**-1234`: asterisks, digits,
 * dashes and spaces, at least one `*`, and at most four digits. Anything
 * else (a full SSN sent by mistake, free text) is never shown.
 */
function isMaskedSsn(value: string | null): value is string {
  if (value === null || !/^[*\d\s-]+$/.test(value) || !value.includes("*")) return false
  return (value.match(/\d/g)?.length ?? 0) <= MASKED_SSN_MAX_DIGITS
}

/**
 * The read view's rows in the F1 order (epics Story 2.1), with no group
 * headings and no email or phone. `KeyValueTable` shows "Not provided" for
 * every empty value (PM3: null, blank, `n/a`, `-1`, `[]`).
 */
function personalRows(myself: Myself): KeyValueRow[] {
  const ssn = myself.socialSecurityNumber
  return [
    { key: "namePrefix", label: PERSON_MESSAGES.namePrefix, value: myself.namePrefix },
    { key: "firstName", label: FIELD_MESSAGES.firstName, value: myself.firstName },
    { key: "middleName", label: FIELD_MESSAGES.middleName, value: myself.middleName },
    { key: "lastName", label: FIELD_MESSAGES.lastName, value: myself.lastName },
    { key: "nameSuffix", label: PERSON_MESSAGES.nameSuffix, value: myself.nameSuffix },
    { key: "otherNames", label: PERSON_MESSAGES.otherNames, value: myself.otherNames },
    { key: "titles", label: PERSON_MESSAGES.titles, value: myself.titles },
    { key: "birthDate", label: FIELD_MESSAGES.birthDate, value: wireToDisplayDate(myself.birthDate) },
    { key: "cityOfBirth", label: PERSON_MESSAGES.cityOfBirth, value: myself.cityOfBirth },
    { key: "race", label: PERSON_MESSAGES.race, value: myself.race },
    { key: "ethnicity", label: PERSON_MESSAGES.ethnicity, value: myself.ethnicity },
    { key: "biologicalGender", label: PERSON_MESSAGES.biologicalGender, value: myself.biologicalGender },
    { key: "genderIdentity", label: PERSON_MESSAGES.genderIdentity, value: myself.genderIdentity },
    { key: "sexualOrientation", label: PERSON_MESSAGES.sexualOrientation, value: myself.sexualOrientation },
    {
      key: "ssn",
      label: PERSON_MESSAGES.ssn,
      value: isMaskedSsn(ssn) ? (
        <span data-slot="masked-ssn" className="mono-value">
          {ssn}
        </span>
      ) : null,
    },
    {
      key: "signature",
      label: SHELL_MESSAGES.signature,
      rowId: SIGNATURE_ANCHOR,
      // `font-normal`: the fallback "Not provided" reads like every other empty value (`kv-value-empty`).
      value: <SignatureThumb fileId={myself.signature?.id} fallback={COMMON_MESSAGES.notProvided} alt={SHELL_MESSAGES.signatureAlt} className="font-normal" />,
    },
  ]
}

/**
 * The `#signature` deep-link target until the table is ready (the real row
 * then replaces it). While loading: a labelled row with a bar for the
 * thumbnail (static under reduced motion). Otherwise (load error, no access):
 * a bare target, so no empty "Signature" row sits under the error.
 */
function SignatureAnchor({ loading }: { readonly loading: boolean }) {
  if (!loading) return <div id={SIGNATURE_ANCHOR} data-slot="signature-anchor" />
  return (
    <div id={SIGNATURE_ANCHOR} role="group" aria-label={SHELL_MESSAGES.signature} className="border-border flex min-h-11 items-center gap-4 border-t px-3">
      <span className="text-muted-foreground text-body-sm w-24 shrink-0">{SHELL_MESSAGES.signature}</span>
      <span aria-hidden="true" className="bg-muted h-3 min-w-0 flex-1 animate-pulse rounded-sm motion-reduce:animate-none" />
    </div>
  )
}

/**
 * Personal information, read view (Story 2.1, FR11, NG-9022): the user's
 * legal name, birth details, demographics, Masked SSN and Signature from the
 * shared `myself` read, in one key/value table. The landmark renders from
 * the first render and is never remounted (F6-1). Once `myself` is cached
 * the table stays, even if a background revalidation fails (the page banner
 * reports that). Only its own load error (no data) claims the page banner
 * (`useClaimMyselfError`), and Retry revalidates only `myself`. No count is reported, so the Section index
 * leaves the count blank. Story 2.2 adds the Edit button with its wiring.
 */
export function PersonalSection() {
  const { myself, error, retry } = useMyself()
  const { onReady } = useSectionFrame("personal")
  const [attempt, setAttempt] = useState(0)
  useClaimMyselfError(Boolean(error) && !myself)
  // Each new failure (a new error object) is a new attempt, so a repeated failure is announced
  // again once it arrives, not on the Retry click. Adjusted while rendering, so the first error
  // is not mounted twice.
  const [seenError, setSeenError] = useState(error)
  if (error !== seenError) {
    setSeenError(error)
    if (error) setAttempt((count) => count + 1)
  }
  // Loaded on mount so Story 2.2's pickers have them; never blocks or errors the read view.
  usePersonOptions(myself?.biologicalGender)

  const state: FrameState = myself ? "ready" : error ? { error: mapFetchError("personal", error) } : "loading"

  return (
    <SectionLandmark id="personal" title={SHELL_MESSAGES.sectionPersonal}>
      <StateFrame
        state={state}
        skeleton="kv"
        loadError={{ kind: "section", sectionId: "personal" }}
        level="section"
        onRetry={retry}
        attempt={attempt}
        anchors={<SignatureAnchor loading={state === "loading"} />}
        onReady={onReady}
      >
        {myself && <KeyValueTable rows={personalRows(myself)} labelledBy={sectionHeadingId("personal")} />}
      </StateFrame>
    </SectionLandmark>
  )
}
