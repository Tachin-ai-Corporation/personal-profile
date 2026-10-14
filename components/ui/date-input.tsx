"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"

import {
  caretAfterDigits,
  compareDates,
  digitsBefore,
  DISPLAY_DATE_LENGTH,
  displayToWireDate,
  formatDisplayDate,
  formatWireDate,
  localCalendarDate,
  maskDisplayDate,
  parseWireDate,
  pastedDisplayDate,
  wireToDisplayDate,
  type CalendarDate,
} from "@/lib/shared/dates"
import { CONTROL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { Calendar } from "./calendar"
import { INPUT_STYLES } from "./input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover"

export interface DateInputChangeDetail {
  /** The masked text as shown (`""`, partial, or `MM/DD/YYYY`): a schema tells "required" from "Enter a date as MM/DD/YYYY" with it. */
  readonly text: string
}

export interface DateInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "inputMode" | "maxLength"> {
  /** The wire value, `YYYY-MM-DD`, or `""` (empty, incomplete or impossible). */
  readonly value: string
  /** Called on every edit with the wire value (`""` unless the text is a real date) and the shown text. */
  readonly onChange: (value: string, detail: DateInputChangeDetail) => void
  /** Earliest selectable day (`YYYY-MM-DD`, inclusive): bounds the calendar. Typed dates outside it are the caller's schema's error. */
  readonly min?: string
  /** Latest selectable day (`YYYY-MM-DD`, inclusive). */
  readonly max?: string
  /** Shows the trailing 44 px calendar button. */
  readonly calendar?: boolean
  /** The calendar button and dialog name; defaults to the catalog's "Choose date". */
  readonly calendarLabel?: string
  /** "Today" for the calendar's initial month (tests); defaults to now. */
  readonly today?: Date
  /** Class of the wrapper (the input box with its button). */
  readonly wrapperClassName?: string
}

/** The calendar's year range when `min` / `max` is missing (the dropdowns need both ends). */
export const CALENDAR_YEARS_BACK = 120
export const CALENDAR_YEARS_AHEAD = 20

const toLocalDate =(date: CalendarDate): Date => new Date(date.year, date.month - 1, date.day)

/** `date` moved into [min, max] when it falls outside. */
function clampDate(date: CalendarDate, min: CalendarDate | null, max: CalendarDate | null): CalendarDate {
  if (max && compareDates(date, max) > 0) return max
  if (min && compareDates(date, min) < 0) return min
  return date
}

/**
 * Masked `MM/DD/YYYY` date input (F5-1): numeric keyboard, slashes inserted
 * as you type, Backspace over a slash removes the digit before it, and a
 * pasted `MM/DD/YYYY` or `YYYY-MM-DD` is accepted whole. Value and
 * `onChange` use the wire form (`lib/shared/dates.ts`). Optional calendar
 * button: a Popover dialog with month/year dropdowns, bounded by `min`/`max`
 * (`birthDateBounds` for birth dates). It invents no copy: messages come from
 * the caller's schema (`PERSON_MESSAGES`). Spread `FormField`'s control props
 * on it; they land on the input (id, `aria-describedby`, `aria-invalid`).
 */
function DateInput({
  value,
  onChange,
  min,
  max,
  calendar = false,
  calendarLabel = CONTROL_MESSAGES.chooseDate,
  today,
  wrapperClassName,
  className,
  placeholder = CONTROL_MESSAGES.datePlaceholder,
  disabled,
  readOnly,
  ref,
  onKeyDown,
  onPaste,
  ...props
}: DateInputProps) {
  const [text, setText] = React.useState(() => wireToDisplayDate(value) ?? "")
  const [syncedValue, setSyncedValue] = React.useState(value)
  const [calendarOpen, setCalendarOpen] = React.useState(false)

  // A new `value` from outside (reset, server data) replaces the text; the echo of our own edit doesn't.
  if (value !== syncedValue) {
    setSyncedValue(value)
    if (value !== (displayToWireDate(text) ?? "")) setText(wireToDisplayDate(value) ?? "")
  }

  /** Shows `next` (already masked) with the caret after `digits` digits, and reports it. */
  const apply = (input: HTMLInputElement, next: string, digits: number): void => {
    // Written to the DOM first so the caret can be placed now (React then renders the same value).
    input.value = next
    const caret = caretAfterDigits(next, digits)
    input.setSelectionRange(caret, caret)
    setText(next)
    onChange(displayToWireDate(next) ?? "", { text: next })
  }

  const minDate = parseWireDate(min)
  const maxDate = parseWireDate(max)
  const selected = parseWireDate(value)
  const disabledDays = [...(minDate ? [{ before: toLocalDate(minDate) }] : []), ...(maxDate ? [{ after: toLocalDate(maxDate) }] : [])]

  const input = (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      maxLength={DISPLAY_DATE_LENGTH}
      data-slot="date-input"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      className={cn(INPUT_STYLES, calendar && "pr-12", className)}
      onChange={(event) => {
        const input = event.currentTarget
        const raw = input.value
        apply(input, maskDisplayDate(raw), digitsBefore(raw, input.selectionStart ?? raw.length))
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.key !== "Backspace") return
        const input = event.currentTarget
        const caret = input.selectionStart ?? 0
        if (caret !== input.selectionEnd || caret === 0 || input.value[caret - 1] !== "/") return
        // Backspace right after a slash deletes the digit before it (the mask would put the slash back).
        event.preventDefault()
        const raw = input.value.slice(0, caret - 2) + input.value.slice(caret)
        apply(input, maskDisplayDate(raw), digitsBefore(input.value, caret) - 1)
      }}
      onPaste={(event) => {
        onPaste?.(event)
        if (event.defaultPrevented) return
        const pasted = pastedDisplayDate(event.clipboardData.getData("text"))
        if (pasted === null) return
        event.preventDefault()
        apply(event.currentTarget, pasted, 8)
      }}
    />
  )

  if (!calendar) {
    return (
      <div className={cn("relative w-full", wrapperClassName)} data-slot="date-input-box">
        {input}
      </div>
    )
  }

  const now = localCalendarDate(today ?? new Date())
  const initialMonth = toLocalDate(selected ?? clampDate(now, minDate, maxDate))
  // An open end still needs a year-dropdown range: 120 years back, 20 years ahead (of today or the other bound).
  const startMonth = minDate ? toLocalDate(minDate) : new Date(Math.min(now.year, maxDate?.year ?? now.year) - CALENDAR_YEARS_BACK, 0, 1)
  const endMonth = maxDate ? toLocalDate(maxDate) : new Date(Math.max(now.year, minDate?.year ?? now.year) + CALENDAR_YEARS_AHEAD, 11, 31)

  return (
    <Popover modal open={calendarOpen} onOpenChange={setCalendarOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative w-full", wrapperClassName)} data-slot="date-input-box">
          {input}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={calendarLabel}
              disabled={disabled || readOnly}
              data-slot="date-input-calendar-button"
              className="text-muted-foreground hover:bg-muted absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-md outline-none transition-colors motion-reduce:transition-none focus-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <CalendarDays aria-hidden="true" className="size-[18px]" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      {/* Modal: focus stays in the calendar until a day is picked or Escape; the rest of the page is aria-hidden. */}
      <PopoverContent aria-label={calendarLabel} aria-modal="true" className="w-auto p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
        <Calendar
          mode="single"
          required
          autoFocus
          selected={selected ? toLocalDate(selected) : undefined}
          defaultMonth={initialMonth}
          today={today}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledDays}
          onSelect={(date) => {
            const day = localCalendarDate(date)
            const wire = formatWireDate(day)
            const display = formatDisplayDate(day)
            setText(display)
            onChange(wire, { text: display })
            setCalendarOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DateInput }
