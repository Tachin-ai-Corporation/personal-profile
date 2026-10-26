"use client"

import { useId, type ReactNode } from "react"
import type { FieldValues, Path, PathValue } from "react-hook-form"
import type { z } from "zod"
import { FieldError } from "@/components/ui/form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { SectionForm } from "@/features/shell"
import { CONTACT_MESSAGES, formatMessage } from "@/lib/shared/messages"

/**
 * The edit-view cells and row helpers the Contact Sections share (Team A,
 * Epic 3: Phone since Stories 3.1–3.4, Email since Story 3.5): a control's
 * help and error wiring, the Label (or Type) `Select`, the Primary row's
 * notifications `Switch` (Story 3.6 shares it), the "—" of a row with no
 * notifications setting, new-row keys and unique row keys. Not foundation:
 * only `features/contacts` imports it.
 */

/** A row the helpers key: anything with a stable `key`. */
interface KeyedRow {
  readonly key: string
}

/**
 * Unique keys: a repeated id (`id-<id>`, in one list or across several) gets
 * its occurrence (`id-<id>~<n>`), so the first one keeps `id-<id>`.
 */
export function uniqueRowKeys<R extends KeyedRow>(rows: readonly R[]): R[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const count = seen.get(row.key) ?? 0
    seen.set(row.key, count + 1)
    return count === 0 ? row : { ...row, key: `${row.key}~${count}` }
  })
}

/** A repeated id's later occurrence (`id-<id>~<n>`, from `uniqueRowKeys`): locked like a row without an id, so only the first one can change. */
export const isRepeatKey = (key: string): boolean => key.includes("~")

/** A new row key (`new-<n>`) no row holds yet; `counter` is the Section's, kept across renders. */
export function nextNewKey(rows: readonly KeyedRow[], counter: { current: number }): string {
  let key: string
  do {
    counter.current += 1
    key = `new-${counter.current}`
  } while (rows.some((row) => row.key === key))
  return key
}

/**
 * The 1health-fe add rule (NG-9023 parity, `PhoneWrapper`/`EmailWrapper`/
 * `SocialMediaWrapper` `addNew`: `trigger()`, then `prepend` only when
 * valid): while editing, a new row is added only once the rows already there
 * are valid. When they aren't, every schema issue is shown at its field (as
 * Save does) and the first one in reading order (`fieldOrder`) is returned,
 * for the caller to focus instead of adding; `undefined` when they are valid.
 */
export function blockAddWhileInvalid<T extends FieldValues>(
  section: Pick<SectionForm<T>, "form">,
  schema: z.ZodType<T, T>,
  fieldOrder: readonly Path<T>[],
): Path<T> | undefined {
  const parsed = schema.safeParse(section.form.getValues())
  if (parsed.success) return undefined
  const paths = parsed.error.issues.map((issue) => {
    const path = issue.path.map(String).join(".") as Path<T>
    section.form.setError(path, { type: "schema", message: issue.message })
    return path
  })
  return fieldOrder.find((path) => paths.includes(path)) ?? paths[0]
}

/** The "—" of a row that has no notifications setting, with its meaning for screen readers. */
export function NotApplicable() {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">{CONTACT_MESSAGES.notificationsNotApplicable}</span>
      <span className="sr-only">{CONTACT_MESSAGES.notificationsNotApplicableLabel}</span>
    </span>
  )
}

/** The wiring `CellField` hands its control. */
export interface CellFieldWiring {
  readonly id: string
  readonly "aria-describedby": string | undefined
  readonly "aria-invalid": true | undefined
}

/** A control's help and error lines, wired to it (`aria-describedby`, `aria-invalid`) with the error in a polite live region. */
export function CellField({
  help,
  error,
  children,
}: {
  readonly help?: ReactNode
  readonly error?: string
  readonly children: (wiring: CellFieldWiring) => ReactNode
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {help ? (
        <p id={helpId} className="text-muted-foreground text-body-sm">
          {help}
        </p>
      ) : null}
      <div aria-live="polite">{error ? <FieldError id={errorId}>{error}</FieldError> : null}</div>
    </div>
  )
}

/** One option of a `ChoiceCell`. */
export interface ChoiceOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

export interface ChoiceCellProps<T extends FieldValues> {
  readonly section: SectionForm<T>
  /** The form path of the row's Label (or Phone's Type). */
  readonly path: Path<T>
  /** The id of the visible header naming the cell (desktop `th`, card label). */
  readonly headerId: string
  readonly options: readonly ChoiceOption[]
  readonly placeholder: string
}

/** A required Label or Type Select (read-only while saving: it doesn't open and ignores changes). */
export function ChoiceCell<T extends FieldValues>({ section, path, headerId, options, placeholder }: ChoiceCellProps<T>) {
  const { ref, ...binding } = section.control(path)
  const error = section.errorFor(path)
  const value = String(binding.value ?? "")
  // A saved label the list doesn't offer still shows on the trigger until changed.
  const unlisted = value !== "" && !options.some((option) => option.value === value) ? { value } : undefined
  return (
    <CellField error={error}>
      {(wiring) => (
        <Select
          value={value}
          open={binding.readOnly ? false : undefined}
          onValueChange={(next) => {
            if (!binding.readOnly) binding.onChange(next as PathValue<T, Path<T>>)
          }}
          placeholder={placeholder}
          unlistedValue={unlisted}
        >
          <SelectTrigger
            {...wiring}
            ref={ref}
            aria-labelledby={headerId}
            aria-required
            onBlur={binding.onBlur}
            aria-readonly={binding.readOnly || undefined}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </CellField>
  )
}

export interface NotificationsSwitchProps<T extends FieldValues> {
  readonly section: SectionForm<T>
  /** The form path of the row's `notifications`. */
  readonly path: Path<T>
  /** How the row is named: "Notifications for {name}" (the formatted number, the address). */
  readonly name: string
  /** The saved setting, shown when the form holds none (a draft stored before the switch existed). */
  readonly saved: boolean
}

/**
 * The Primary row's Notifications switch (Stories 3.4, 3.6), named
 * "Notifications for {name}": a toggle makes the Section dirty and Save
 * sends only that row. Read-only while saving (it ignores presses).
 */
export function NotificationsSwitch<T extends FieldValues>({ section, path, name, saved }: NotificationsSwitchProps<T>) {
  const { ref, ...binding } = section.control(path)
  // A draft stored before the switch existed holds no value: the saved one shows.
  const checked = typeof binding.value === "boolean" ? binding.value : saved
  return (
    <Switch
      ref={ref}
      name={binding.name}
      checked={checked}
      aria-label={formatMessage(CONTACT_MESSAGES.notificationsFor, { number: name })}
      aria-readonly={binding.readOnly || undefined}
      onCheckedChange={(next) => {
        if (!binding.readOnly) binding.onChange(next as PathValue<T, Path<T>>)
      }}
      onBlur={binding.onBlur}
    />
  )
}
