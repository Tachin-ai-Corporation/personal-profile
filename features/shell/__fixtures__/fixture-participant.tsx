"use client"

import { useId, useRef, useState } from "react"
import type { SaveResult, SectionId } from "../nav-types"
import { useRegisterSection } from "../section-registry"

export type FixtureSaveBehavior = "ok" | "fail" | "throw"

export interface FixtureParticipantProps {
  readonly id: SectionId
  readonly label: string
  readonly displayOrder: number
  /** `false` registers without `save` (a guard-only participant that can't save). */
  readonly canSave?: boolean
  readonly saveBehavior?: FixtureSaveBehavior
  readonly onSave?: (value: string) => void
}

/**
 * Test-only participant (unit tests and the e2e fixture page): one text field
 * that is dirty when it differs from its baseline, invalid when it reads
 * "invalid". Not app UI; its strings are fixture data, not catalog copy.
 */
export function FixtureParticipant({ id, label, displayOrder, canSave = true, saveBehavior = "ok", onSave }: FixtureParticipantProps) {
  const inputId = useId()
  const [baseline, setBaseline] = useState("")
  const [value, setValue] = useState("")
  const [status, setStatus] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function save(): Promise<SaveResult> {
    onSave?.(value)
    if (saveBehavior === "throw") throw new Error("fixture save failed")
    if (saveBehavior === "fail") {
      setStatus("not saved")
      return { ok: false, error: { code: "FIXTURE" } }
    }
    setBaseline(value)
    setStatus("saved")
    return { ok: true }
  }

  useRegisterSection({
    id,
    label,
    displayOrder,
    isDirty: value !== baseline,
    validate: () => (value === "invalid" ? { valid: false, focusFirstInvalid: () => inputRef.current?.focus() } : { valid: true }),
    save: canSave ? save : undefined,
    discard: () => setValue(baseline),
  })

  return (
    <div data-testid={`fixture-${id}`}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} />
      <output>{status}</output>
    </div>
  )
}
