"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DateInput } from "@/components/ui/date-input"
import type { FieldControlProps } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  KeyValueEditTable,
  KeyValueTable,
  SIGNATURE_ANCHOR,
  SectionContainer,
  SectionFooter,
  SectionHeader,
  SignatureThumb,
  StateFrame,
  sectionHeadingId,
  useClaimMyselfError,
  useMyself,
  useSectionForm,
  useSectionFrame,
  type FrameState,
  type KeyValueEditRow,
  type KeyValueRow,
  type SectionDataStatus,
  type SectionForm,
} from "@/features/shell"
import { mapFetchError, savePersonalInformation, type Myself } from "@/lib/api"
import { displayToWireDate, formatWireDate, localCalendarDate, wireToDisplayDate } from "@/lib/shared/dates"
import { COMBOBOX_MESSAGES, COMMON_MESSAGES, FIELD_MESSAGES, PERSON_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { birthDateBounds, normalizeName, type BirthDateBounds } from "@/lib/shared/person-rules"
import {
  ageRangeMessage,
  PERSONAL_DRAFT_FIELDS,
  PERSONAL_FIELD_ORDER,
  PERSONAL_LABELS,
  PERSONAL_OPTIONAL_FIELDS,
  personalDiff,
  personalDraftDiff,
  personalSchema,
  toPersonalValues,
  type PersonalField,
  type PersonalValues,
} from "./schema"
import { isMaskedSsn, toSsnFormValue } from "./ssn"
import { SSN_CONTROL_ID, SsnInput, SsnValue } from "./ssn-field"
import { PERSON_PRESELECTS, usePersonOptions } from "./use-person-options"

/** The Masked SSN with Reveal (Story 2.3), or `null` (read as "Not provided") when there is no safe mask. */
function maskedSsn(myself: Myself): ReactNode {
  const ssn = myself.socialSecurityNumber
  return isMaskedSsn(ssn) ? <SsnValue mask={ssn} /> : null
}

/** The Signature thumbnail ("Not provided" without one or when the image fails). */
function signatureThumb(myself: Myself): ReactNode {
  // `font-normal`: the fallback "Not provided" reads like every other empty value (`kv-value-empty`).
  return <SignatureThumb fileId={myself.signature?.id} fallback={COMMON_MESSAGES.notProvided} alt={SHELL_MESSAGES.signatureAlt} className="font-normal" />
}

/**
 * The read view's rows in the F1 order (epics Story 2.1), with no group
 * headings and no email or phone. `KeyValueTable` shows "Not provided" for
 * every empty value (PM3: null, blank, `n/a`, `-1`, `[]`).
 */
function personalRows(myself: Myself): KeyValueRow[] {
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
    { key: "ssn", label: PERSON_MESSAGES.ssn, value: maskedSsn(myself) },
    { key: "signature", label: SHELL_MESSAGES.signature, rowId: SIGNATURE_ANCHOR, value: signatureThumb(myself) },
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

type PersonalSectionForm = SectionForm<PersonalValues>
/** `section.control(name)`: the wiring of a non-native control. */
type Binding = ReturnType<PersonalSectionForm["control"]>

/**
 * A read-only value in the edit view (Signature until Story 2.4 adds its
 * control): an `<output>` (labelable, so the row's label names it), not a
 * live region.
 */
function ReadOnlyValue({ wiring, children }: { readonly wiring: FieldControlProps; readonly children: ReactNode }) {
  return (
    <output id={wiring.id} aria-live="off" data-slot="personal-read-only" className="text-foreground text-body-sm flex min-h-11 items-center font-medium">
      {children ?? <span className="text-muted-foreground font-normal">{COMMON_MESSAGES.notProvided}</span>}
    </output>
  )
}

interface ChoiceControlProps {
  readonly wiring: FieldControlProps
  readonly binding: Binding
  readonly options: readonly string[]
}

/** Race, Ethnicity or Biological gender: a Select of the offered values (no picker value can be a 400). */
function ChoiceControl({ wiring, binding: { ref, ...binding }, options }: ChoiceControlProps) {
  // A value that isn't offered (a saved platform-only value, or a fallback pick a later list dropped)
  // still shows on the trigger; it can't be picked again once changed (Cancel brings a saved one back).
  const unlisted = binding.value !== "" && !options.includes(binding.value) ? { value: binding.value } : undefined
  return (
    <Select
      value={binding.value}
      // Read-only while saving: it doesn't open and ignores changes (controls are never `disabled`).
      open={binding.readOnly ? false : undefined}
      onValueChange={(value) => {
        if (!binding.readOnly) binding.onChange(value)
      }}
      unlistedValue={unlisted}
    >
      <SelectTrigger {...wiring} ref={ref} onBlur={binding.onBlur} aria-readonly={binding.readOnly || undefined} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface BirthDateControlProps {
  readonly wiring: FieldControlProps
  readonly binding: Binding
  readonly bounds: BirthDateBounds
}

/**
 * The Birth date: a masked `MM/DD/YYYY` input with the calendar, bounded by
 * the age rule. The form holds the shown text (so the schema tells
 * "required" from "Enter a date as MM/DD/YYYY"); a value set from outside
 * (a restored draft) bumps `resetKey`, so the input shows it.
 */
function BirthDateControl({ wiring, binding: { ref, ...binding }, bounds }: BirthDateControlProps) {
  const [shown, setShown] = useState(binding.value)
  const [resetKey, setResetKey] = useState(0)
  if (binding.value !== shown) {
    setShown(binding.value)
    setResetKey((key) => key + 1)
  }
  return (
    <DateInput
      {...wiring}
      ref={ref}
      name={binding.name}
      value={displayToWireDate(binding.value) ?? ""}
      onChange={(_value, { text }) => {
        setShown(text)
        binding.onChange(text)
      }}
      onBlur={binding.onBlur}
      readOnly={binding.readOnly}
      min={bounds.min}
      max={bounds.max}
      calendar
      resetKey={resetKey}
      autoComplete="bday"
    />
  )
}

/** Gender identity: the fixed list or free text (F5-2 Combobox), wired to the table row (`control`). */
function GenderIdentityControl({ wiring, binding: { ref, ...binding }, options }: ChoiceControlProps) {
  return (
    <Combobox<string>
      label={PERSON_MESSAGES.genderIdentity}
      control={wiring}
      inputRef={ref}
      name={binding.name}
      staticOptions={options}
      getKey={(option) => option}
      getLabel={(option) => option}
      mode="free-text"
      text={binding.value}
      onTextChange={(text) => {
        // Read-only while saving: typing doesn't change the controlled text.
        if (!binding.readOnly) binding.onChange(text)
      }}
      onBlur={binding.onBlur}
    />
  )
}

/** The `autoComplete` tokens of the user's own name fields (WCAG 1.3.5). */
const AUTOCOMPLETE: Partial<Record<PersonalField, string>> = {
  namePrefix: "honorific-prefix",
  firstName: "given-name",
  middleName: "additional-name",
  lastName: "family-name",
  nameSuffix: "honorific-suffix",
}


interface EditRowsInput {
  readonly section: PersonalSectionForm
  readonly myself: Myself
  readonly offered: ReturnType<typeof usePersonOptions>["offered"]
  readonly genderIdentityOptions: readonly string[]
  readonly bounds: BirthDateBounds
  readonly ageRange: string
  /** The saved SSN mask (`""` without one): what the schema and the input treat as untouched. */
  readonly ssnMask: string
}

/** The edit view's rows in the F1 order; the SSN input (Story 2.3); Signature stays read-only (Story 2.4 adds its control). */
function personalEditRows({ section, myself, offered, genderIdentityOptions, bounds, ageRange, ssnMask }: EditRowsInput): KeyValueEditRow[] {
  const base = (field: PersonalField, render: KeyValueEditRow["render"], help?: ReactNode): KeyValueEditRow => ({
    key: field,
    label: PERSONAL_LABELS[field],
    optional: PERSONAL_OPTIONAL_FIELDS.has(field) || undefined,
    required: !PERSONAL_OPTIONAL_FIELDS.has(field) || undefined,
    help,
    error: section.errorFor(field),
    render,
  })
  const text = (field: PersonalField, help?: ReactNode): KeyValueEditRow =>
    base(field, (wiring) => <Input {...wiring} {...section.field(field)} autoComplete={AUTOCOMPLETE[field] ?? "off"} />, help)
  const choice = (field: "race" | "ethnicity" | "biologicalGender"): KeyValueEditRow =>
    base(field, (wiring) => <ChoiceControl wiring={wiring} binding={section.control(field)} options={offered[field]} />)
  const birthDateError = section.errorFor("birthDate")

  return [
    text("namePrefix"),
    text("firstName"),
    text("middleName"),
    text("lastName"),
    text("nameSuffix"),
    text("otherNames", PERSON_MESSAGES.otherNamesHelp),
    text("titles"),
    // The age rule is explained before any error, and hidden while the field shows one.
    base("birthDate", (wiring) => <BirthDateControl wiring={wiring} binding={section.control("birthDate")} bounds={bounds} />, birthDateError ? undefined : ageRange),
    text("cityOfBirth"),
    choice("race"),
    choice("ethnicity"),
    choice("biologicalGender"),
    base(
      "genderIdentity",
      (wiring) => <GenderIdentityControl wiring={wiring} binding={section.control("genderIdentity")} options={genderIdentityOptions} />,
      COMBOBOX_MESSAGES.genderIdentityHelp,
    ),
    // Its help is also its length error: hidden while the field shows an error.
    text("sexualOrientation", section.errorFor("sexualOrientation") ? undefined : PERSON_MESSAGES.sexualOrientationHelp),
    {
      key: "ssn",
      label: PERSON_MESSAGES.ssn,
      optional: true,
      // No "ssn" or "social" in the id or name: password managers and autofill leave it alone.
      controlId: SSN_CONTROL_ID,
      error: section.errorFor("socialSecurityNumber"),
      render: (wiring) => <SsnInput wiring={wiring} binding={section.control("socialSecurityNumber")} savedMask={ssnMask} />,
    },
    {
      key: "signature",
      label: SHELL_MESSAGES.signature,
      optional: true,
      rowId: SIGNATURE_ANCHOR,
      render: (wiring) => <ReadOnlyValue wiring={wiring}>{signatureThumb(myself)}</ReadOnlyValue>,
    },
  ]
}

/**
 * Personal information (Stories 2.1–2.3, FR11–FR13, NG-9022): the user's
 * legal name, birth details, demographics, Masked SSN and Signature from the
 * shared `myself` read, viewed in one key/value table and edited in place
 * on `useSectionForm` (registered as `personal`, first in Save all, drafts
 * of the 14 demographic fields). The landmark renders from the first render
 * and is never remounted (F6-1). Once `myself` is cached the table stays,
 * even if a background revalidation fails (the page banner reports that).
 * Only its own load error (no data) claims the page banner
 * (`useClaimMyselfError`), and Retry revalidates only `myself`. No count is
 * reported, so the Section index leaves the count blank.
 *
 * Edit: an unset Race or Ethnicity preselects "Unknown", an unset
 * Biological gender or Gender identity "Asked but not answered" (sent on
 * Save, never drafted on their own). The pickers offer only values the
 * `PUT v2/user/edit` accepts; a saved value that isn't offered shows on the
 * trigger until changed. Save sends only the changed fields
 * (`savePersonalInformation`), which revalidates `myself`.
 *
 * SSN (Story 2.3): Reveal shows the full SSN for 30 s in both views, held
 * only by the SSN component (`ssn-field.tsx`). The form holds the saved mask,
 * `""` or a typed entry; a clear is sent as `"n/a"`, the mask never. On the
 * way back to read view the baseline is rebased onto `myself`, so a typed SSN
 * leaves the form state and the hook's saved-values override.
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
  // Loaded on mount, so the pickers have them; never blocks or errors the read view.
  const options = usePersonOptions(myself?.biologicalGender)
  const roles = myself?.roles
  // One "today" per render for the schema and the calendar bounds; the schema is rebuilt when the local day changes.
  const today = new Date()
  const dayKey = formatWireDate(localCalendarDate(today))
  // The saved mask (`toPersonalValues(myself).socialSecurityNumber`, the form baseline's SSN): the schema's
  // untouched value and the input's, from one place.
  const ssnMask = toSsnFormValue(myself?.socialSecurityNumber)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is keyed by its local day (`dayKey`)
  const schema = useMemo(() => personalSchema(roles, today, ssnMask), [roles, dayKey, ssnMask])
  const dataStatus: SectionDataStatus = myself ? "loaded" : error ? "error" : "loading"

  const section = useSectionForm<PersonalValues>({
    id: "personal",
    label: SHELL_MESSAGES.sectionPersonal,
    displayOrder: 1,
    schema,
    baseline: toPersonalValues(myself),
    save: (values, baseline) => savePersonalInformation(personalDiff(values, baseline)),
    onNoChanges: "close",
    fieldOrder: PERSONAL_FIELD_ORDER,
    // SSN taken (`errors/personal.ts`) marks the SSN input only.
    errorFields: { ssn: "socialSecurityNumber" },
    draftFields: PERSONAL_DRAFT_FIELDS,
    describeDraftDiff: personalDraftDiff,
    dataStatus,
  })
  const { form, isEditing, rebase } = section

  // Back in read view (saved or cancelled): rebase onto `myself`, so a typed SSN leaves the form
  // values and the hook's saved-values override (the read view shows `myself`, with the new mask).
  const wasEditing = useRef(false)
  useEffect(() => {
    const leftEdit = wasEditing.current && !isEditing
    wasEditing.current = isEditing
    if (leftEdit) rebase(toPersonalValues(myself))
  }, [isEditing, myself, rebase])

  // Opening edit fills the unset pickers. `setValue` presets count as changes (sent on Save) but are not the user's, so they write no draft.
  useEffect(() => {
    if (!isEditing) return
    for (const [field, value] of Object.entries(PERSON_PRESELECTS) as [keyof typeof PERSON_PRESELECTS, string][]) {
      if (normalizeName(form.getValues(field)) === "") form.setValue(field, value, { shouldDirty: true })
    }
  }, [isEditing, form])

  const headingId = sectionHeadingId("personal")
  const state: FrameState = myself ? "ready" : error ? { error: mapFetchError("personal", error) } : "loading"

  return (
    // The landmark itself (not `SectionLandmark`), so the header can show "Editing" (as the fixture Section does).
    <section id="personal" aria-labelledby={headingId} className="min-w-0">
      <SectionHeader
        id="personal"
        title={SHELL_MESSAGES.sectionPersonal}
        editing={isEditing}
        className="mb-2"
        actions={
          myself && !isEditing ? (
            <Button type="button" variant="outline" size="touch" {...section.editButtonProps}>
              {SECTION_MESSAGES.edit}
            </Button>
          ) : null
        }
      />
      <StateFrame
        state={state}
        skeleton="kv"
        loadError={{ kind: "section", sectionId: "personal" }}
        level="section"
        onRetry={retry}
        attempt={attempt}
        anchors={<SignatureAnchor loading={state === "loading"} />}
        onReady={onReady}
        // Once ready the Section container is the card (it carries the editing halo and the draft notice).
        className={myself ? "overflow-visible rounded-none border-0 bg-transparent" : undefined}
      >
        {myself && (
          <SectionContainer editing={isEditing} sectionId="personal">
            {isEditing ? (
              <>
                <KeyValueEditTable
                  labelledBy={headingId}
                  rows={personalEditRows({
                    section,
                    myself,
                    offered: options.offered,
                    genderIdentityOptions: options.genderIdentity,
                    bounds: birthDateBounds(roles, today),
                    ageRange: ageRangeMessage(roles),
                    ssnMask,
                  })}
                />
                <SectionFooter {...section.footerProps} />
              </>
            ) : (
              <KeyValueTable rows={personalRows(myself)} labelledBy={headingId} />
            )}
          </SectionContainer>
        )}
      </StateFrame>
    </section>
  )
}
