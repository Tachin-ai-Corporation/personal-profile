"use client"

import * as React from "react"
import { Lock } from "lucide-react"

import { INPUT_STYLES } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface InputLockedProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "readOnly" | "onChange" | "defaultValue" | "value" | "children"> {
  /** The saved value that can't change here. */
  readonly value: string
  /** Why it is locked (catalog copy, e.g. "Your username can't be changed here."); announced with the field. */
  readonly help: React.ReactNode
}

/**
 * DESIGN.md `input-locked`: a saved value that can't change, in a muted box
 * with a lock icon and a help line beneath. It is `readOnly` with
 * `aria-readonly`, stays focusable (the value can be read and copied), and the
 * help line is referenced by `aria-describedby` (first, then any caller ids,
 * matching the visual order).
 */
export const InputLocked = React.forwardRef<HTMLInputElement, InputLockedProps>(function InputLocked(
  { value, help, id, className, "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const helpId = `${inputId}-locked-help`

  return (
    <div data-slot="input-locked" className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type="text"
          {...props}
          value={value}
          readOnly
          aria-readonly="true"
          // Visual order: the locked help line sits right under the input, before any FormField help or error.
          aria-describedby={[helpId, describedBy].filter(Boolean).join(" ")}
          // pr-10 clears the lock icon; invalid keeps it clear (2 px border + 39 px = 1 px + 40 px).
          className={cn(INPUT_STYLES, "bg-muted text-secondary-foreground cursor-default pr-10 aria-invalid:pr-[39px]", className)}
        />
        <Lock aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
      </div>
      <p id={helpId} data-slot="input-locked-help" className="text-muted-foreground text-body-sm">
        {help}
      </p>
    </div>
  )
})
