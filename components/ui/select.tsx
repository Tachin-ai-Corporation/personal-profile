"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// shadcn/ui (new-york) Select on @radix-ui/react-select 2.3.7, on 1health tokens,
// ported from main b005536 (F3-1). The trigger's boundary is `control-border`
// (DESIGN.md override) and its focus style is the shared `focus-ring` utility
// (app/globals.css). DESIGN.md Inputs: the default trigger is the input box
// (44 px, 16 px text, card fill) and `aria-invalid` gives the 2 px error border;
// options are 44 px rows.
//
// F5-1 adds, on the root: `ariaDisabled` (shown but never opened, still
// focusable), `helper` (a help line under the trigger, in its
// `aria-describedby`), `loading` (`aria-busy`), `placeholder` and
// `unlistedValue` (a stored value that isn't among the options).

/** A stored value that is not among the options: shown on the trigger, never offered as an option. */
export interface SelectUnlistedValue {
  readonly value: string
  /** Its label when known; otherwise the trigger shows the raw value. */
  readonly label?: React.ReactNode
}

interface SelectState {
  readonly ariaDisabled: boolean
  readonly loading: boolean
  readonly helper: React.ReactNode
  readonly helperId: string
  readonly placeholder: React.ReactNode
  readonly unlistedValue: SelectUnlistedValue | undefined
}

const SelectStateContext = React.createContext<SelectState | null>(null)

/** Only `undefined`, `null`, `false` and `""` count as no helper. */
const isEmptyNode = (node: React.ReactNode): boolean => node === undefined || node === null || node === false || node === ""

export interface SelectProps extends React.ComponentProps<typeof SelectPrimitive.Root> {
  /**
   * Shown but unavailable: the trigger stays focusable with
   * `aria-disabled="true"` and never opens (pointer, keyboard, typeahead).
   * Pair it with a `helper` that says why (EXPERIENCE.md aria-disabled pattern).
   */
  readonly ariaDisabled?: boolean
  /** A help line under the trigger (may hold an in-app link), referenced by the trigger's `aria-describedby`. */
  readonly helper?: React.ReactNode
  /** The options are loading: `aria-busy="true"` on the trigger. */
  readonly loading?: boolean
  /** Shown while there is no value (catalog copy, e.g. "Select a value"); a `SelectValue placeholder` wins. */
  readonly placeholder?: React.ReactNode
  /** A stored value missing from the options (Story 7.5 regional preferences); see `SelectUnlistedValue`. */
  readonly unlistedValue?: SelectUnlistedValue
}

function Select({ ariaDisabled = false, helper, loading = false, placeholder, unlistedValue, open, onOpenChange, ...props }: SelectProps) {
  const helperId = `${React.useId()}-helper`
  const state = React.useMemo<SelectState>(
    () => ({ ariaDisabled, loading, helper, helperId, placeholder, unlistedValue }),
    [ariaDisabled, loading, helper, helperId, placeholder, unlistedValue],
  )
  return (
    <SelectStateContext.Provider value={state}>
      <SelectPrimitive.Root
        data-slot="select"
        open={ariaDisabled ? false : open}
        onOpenChange={(next) => {
          if (!ariaDisabled) onOpenChange?.(next)
        }}
        {...props}
      />
    </SelectStateContext.Provider>
  )
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({ placeholder, ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const state = React.useContext(SelectStateContext)
  return <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder ?? state?.placeholder} {...props} />
}

/** Keeps an `ariaDisabled` trigger closed: its own handlers see a prevented event and skip opening and typeahead. */
function blockWhen<E extends React.SyntheticEvent>(blocked: boolean, handler: ((event: E) => void) | undefined, allow?: (event: E) => boolean) {
  return (event: E): void => {
    if (blocked && !allow?.(event)) event.preventDefault()
    handler?.(event)
  }
}

function SelectTrigger({
  className,
  size = "default",
  children,
  onPointerDown,
  onKeyDown,
  onClick,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  const state = React.useContext(SelectStateContext)
  const ariaDisabled = state?.ariaDisabled ?? false
  const hasHelper = state !== null && !isEmptyNode(state.helper)
  const describedBy = [props["aria-describedby"], hasHelper ? state.helperId : null].filter(Boolean).join(" ") || undefined

  const trigger = (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-control-border bg-card data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-ring aria-invalid:border-2 aria-invalid:border-error aria-invalid:px-[11px] flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 whitespace-nowrap transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-muted-foreground data-[size=default]:h-11 data-[size=default]:text-body data-[size=sm]:h-8 data-[size=sm]:text-sm *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
      aria-describedby={describedBy}
      aria-disabled={ariaDisabled ? true : props["aria-disabled"]}
      aria-busy={state?.loading ? true : props["aria-busy"]}
      onPointerDown={blockWhen(ariaDisabled, (event: React.PointerEvent<HTMLButtonElement>) => {
        // Radix would open here; a pointer press on an aria-disabled trigger still focuses it.
        if (ariaDisabled) event.currentTarget.focus()
        onPointerDown?.(event)
      })}
      onKeyDown={blockWhen(ariaDisabled, onKeyDown, (event) => event.key === "Tab")}
      onClick={blockWhen(ariaDisabled, onClick)}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )

  if (!hasHelper) return trigger
  return (
    <>
      {trigger}
      <p id={state.helperId} data-slot="select-helper" className="text-muted-foreground text-body-sm">
        {state.helper}
      </p>
    </>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const unlisted = React.useContext(SelectStateContext)?.unlistedValue
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {unlisted ? (
            // Hidden and disabled: it only names the stored value on the trigger, and once the
            // value changes it can never be chosen again (not listed, skipped by keys and typeahead).
            <SelectPrimitive.Item value={unlisted.value} disabled hidden data-slot="select-unlisted-item">
              <SelectPrimitive.ItemText>{unlisted.label ?? unlisted.value}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
          ) : null}
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-sm py-2 pr-8 pl-2 text-body-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
