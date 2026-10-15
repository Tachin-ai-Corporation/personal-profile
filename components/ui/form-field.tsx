"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"

import { COMMON_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/** The wiring a control inside a `FormField` spreads onto itself. */
export interface FieldControlProps {
  readonly id: string
  readonly "aria-describedby": string | undefined
  readonly "aria-invalid": true | undefined
  /** Set with `FormField required`: native `required` and `aria-required`. */
  readonly required: true | undefined
  readonly "aria-required": true | undefined
}

/** Only `undefined`, `null`, `false` and `""` count as no help / no error. */
function isEmpty(node: React.ReactNode): boolean {
  return node === undefined || node === null || node === false || node === ""
}

export interface FieldErrorProps {
  readonly id: string
  readonly children: React.ReactNode
  readonly className?: string
}

/** DESIGN.md `help-text-error`: alert icon + message in error-strong, cell-strong type. */
export function FieldError({ id, children, className }: FieldErrorProps): React.JSX.Element {
  return (
    <p id={id} data-slot="field-error" className={cn("text-error-strong flex items-start gap-1.5 text-body-sm font-medium", className)}>
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export interface FormFieldProps {
  readonly label: string
  /** Adds the muted "(optional)" suffix; required fields carry no marker (EXPERIENCE.md). */
  readonly optional?: boolean
  /** Marks the control required for assistive tech (`aria-required`, `required`); still no visible marker. */
  readonly required?: boolean
  /** Default help under the control (`help-text`). */
  readonly help?: React.ReactNode
  /** The field's error message (catalog copy); sets `aria-invalid` and the 2 px error border. */
  readonly error?: React.ReactNode
  /** The control id; generated when omitted. */
  readonly id?: string
  /** Extra content after the label (e.g. an `InfoIconButton`). */
  readonly labelAddon?: React.ReactNode
  /** Renders the control with the field's `id`, `aria-describedby` (help, then error) and `aria-invalid`. */
  readonly children: (control: FieldControlProps) => React.ReactNode
  readonly className?: string
}

/**
 * A labelled control with help and error lines (Story 1.11, FR4): wires the
 * label `for`, `aria-describedby` and `aria-invalid`. The error line sits in a
 * polite live region, so an error that appears on blur is announced.
 */
export function FormField({
  label,
  optional = false,
  required = false,
  help,
  error,
  id,
  labelAddon,
  children,
  className,
}: FormFieldProps): React.JSX.Element {
  const generatedId = React.useId()
  const controlId = id ?? generatedId
  const helpId = `${controlId}-help`
  const errorId = `${controlId}-error`
  const hasHelp = !isEmpty(help)
  const hasError = !isEmpty(error)
  const describedBy = [hasHelp ? helpId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1">
        <label htmlFor={controlId} className="text-body-sm text-foreground font-medium">
          {label}
          {optional ? (
            <>
              {" "}
              <span className="text-muted-foreground font-normal">{COMMON_MESSAGES.optionalSuffix}</span>
            </>
          ) : null}
        </label>
        {labelAddon}
      </div>
      {children({
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": hasError ? true : undefined,
        required: required ? true : undefined,
        "aria-required": required ? true : undefined,
      })}
      {hasHelp ? (
        <p id={helpId} data-slot="field-help" className="text-muted-foreground text-body-sm">
          {help}
        </p>
      ) : null}
      <div aria-live="polite">{hasError ? <FieldError id={errorId}>{error}</FieldError> : null}</div>
    </div>
  )
}
