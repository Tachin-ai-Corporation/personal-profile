import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * DESIGN.md `input`: 44 px, 16 px text (no iOS zoom), `rounded-md`, 1 px
 * `control-border`, the shared `focus-ring`; `aria-invalid` turns the
 * boundary into the 2 px `error` border (`input-error`).
 */
export const INPUT_STYLES = cn(
  'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-card border-control-border flex h-11 w-full min-w-0 rounded-md border px-3 py-2 text-body transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'focus-ring',
  // The text stays put: 2 px border + 11 px padding = 1 px border + 12 px padding.
  'aria-invalid:border-2 aria-invalid:border-error aria-invalid:px-[11px]',
)

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(INPUT_STYLES, className)} {...props} />
}

export { Input }
