"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import { KeyValueEditTable, KeyValueTable } from "../key-value-table"
import { sectionHeadingId, type DraftDiffRow, type DraftValues, type SaveResult } from "../nav-types"
import { SectionContainer } from "../section-container"
import { SectionFooter } from "../section-footer"
import { SectionHeader } from "../section-header"
import { useSectionForm, type UseSectionFormOptions } from "../use-section-form"
import { fixtureSectionSchema, type FixtureSectionValues } from "./schema"

export const FIXTURE_BASELINE: FixtureSectionValues = { number: "4155512125", note: "" }

/** The fixture's draft fields (F4). */
export const FIXTURE_DRAFT_FIELDS = ["number", "note"] as const

const FIXTURE_LABELS: Readonly<Record<string, string>> = { number: "Number", note: "Note" }

/** The fixture's conflict compare rows: one per draft field whose draft value differs from the current one. */
export function fixtureDraftDiff(draft: DraftValues, current: DraftValues): readonly DraftDiffRow[] {
  return FIXTURE_DRAFT_FIELDS.filter((field) => draft[field] !== current[field]).map((field) => ({
    field,
    label: FIXTURE_LABELS[field],
    mine: String(draft[field] ?? ""),
    current: String(current[field] ?? ""),
  }))
}

export interface FixtureSectionProps
  extends Partial<
    Pick<
      UseSectionFormOptions<FixtureSectionValues>,
      | "onNoChanges"
      | "successToast"
      | "cancelFocus"
      | "saveAll"
      | "displayOrder"
      | "draftFields"
      | "describeDraftDiff"
      | "dataStatus"
      | "describeError"
      | "errorFields"
    >
  > {
  readonly baseline?: FixtureSectionValues
  /** Defaults to an immediate `{ ok: true }`; `rebase` is the Section's (for `runSaveSteps`). */
  readonly save?: (
    values: FixtureSectionValues,
    baseline: FixtureSectionValues,
    rebase: (next: FixtureSectionValues) => void,
  ) => Promise<SaveResult>
  /** Shows "Add row" in the footer (fixture only). */
  readonly onAddRow?: () => void
}

/**
 * Test-only Section (unit tests and the e2e fixture page; F3-2): id `phone`,
 * label "Phone", its own `schema.ts`, a required 10-digit number and an
 * optional note, on `useSectionForm` with the shared chrome and key/value
 * table, and its stored-draft slot (F4). Not app UI; its labels are fixture
 * data, its messages catalog copy.
 */
export function FixtureSection({ baseline = FIXTURE_BASELINE, save = async () => ({ ok: true }), onAddRow, ...options }: FixtureSectionProps) {
  const rebase = useRef<(next: FixtureSectionValues) => void>(() => undefined)
  const section = useSectionForm<FixtureSectionValues>({
    id: "phone",
    label: "Phone",
    displayOrder: 2,
    schema: fixtureSectionSchema,
    baseline,
    save: (values, current) => save(values, current, (next) => rebase.current(next)),
    ...options,
  })
  useEffect(() => {
    rebase.current = section.rebase
  })
  const headingId = sectionHeadingId("phone")
  const { isEditing } = section

  return (
    <section aria-labelledby={headingId} data-testid="fixture-section" className="flex flex-col gap-2">
      <SectionHeader
        id="phone"
        title="Phone"
        count={1}
        editing={isEditing}
        actions={
          isEditing ? null : (
            <Button type="button" variant="outline" size="touch" {...section.editButtonProps}>
              {SECTION_MESSAGES.edit}
            </Button>
          )
        }
      />
      <SectionContainer editing={isEditing} sectionId="phone">
        {isEditing ? (
          <>
            <KeyValueEditTable
              labelledBy={headingId}
              rows={[
                {
                  key: "number",
                  label: "Number",
                  required: true,
                  error: section.errorFor("number"),
                  render: (control) => <Input {...control} {...section.field("number")} inputMode="numeric" autoComplete="tel-national" />,
                },
                {
                  key: "note",
                  label: "Note",
                  optional: true,
                  help: "Shown only to you.",
                  render: (control) => <Input {...control} {...section.field("note")} />,
                },
              ]}
            />
            <SectionFooter {...section.footerProps} addRow={onAddRow ? { label: "Add row", onClick: onAddRow } : undefined} />
          </>
        ) : (
          <KeyValueTable
            labelledBy={headingId}
            rows={[
              { key: "number", label: "Number", value: section.baseline.number },
              { key: "note", label: "Note", value: section.baseline.note },
            ]}
          />
        )}
      </SectionContainer>
    </section>
  )
}
