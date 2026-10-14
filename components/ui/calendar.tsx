"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type ChevronProps, type DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"

/**
 * shadcn-style Calendar on `react-day-picker` (pinned 10.0.1, `date-fns` 4),
 * styled with tokens only (the library stylesheet is not loaded). Defaults:
 * month and year dropdown captions (native selects, 44 px), 44 px day
 * buttons, outside days shown, and the library's keyboard grid (arrows,
 * Home/End, Page Up/Down; Escape is the enclosing Popover's). Bound it with
 * `startMonth`/`endMonth` (the dropdown range) and `disabled` (the days).
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>

const NAV_BUTTON =
  "text-foreground hover:bg-muted inline-flex size-11 items-center justify-center rounded-md outline-none transition-colors motion-reduce:transition-none focus-ring aria-disabled:pointer-events-none aria-disabled:opacity-50"

function CalendarChevron({ orientation, className }: ChevronProps): React.JSX.Element {
  const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown
  return <Icon aria-hidden="true" className={cn("size-4", className)} />
}

/** A visible native select (keyboard and screen readers get the platform control), on the input tokens. */
function CalendarDropdown({ options, className, ...props }: DropdownProps): React.JSX.Element {
  return (
    <span className="relative inline-flex items-center">
      <select
        className={cn(
          "border-control-border bg-card text-foreground h-11 appearance-none rounded-md border py-0 pr-8 pl-3 text-body font-medium outline-none focus-ring disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {options?.map(({ value, label, disabled }) => (
          <option key={value} value={value} disabled={disabled}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="text-muted-foreground pointer-events-none absolute right-2.5 size-4" />
    </span>
  )
}

function Calendar({ className, classNames, components, showOutsideDays = true, captionLayout = "dropdown", ...props }: CalendarProps) {
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-2", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col",
        month: "flex flex-col gap-2",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: NAV_BUTTON,
        button_next: NAV_BUTTON,
        month_caption: "flex h-11 items-center justify-center px-11",
        caption_label: "text-body font-medium",
        dropdowns: "flex items-center gap-1",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground w-11 text-caption font-normal",
        week: "flex",
        day: "size-11 p-0 text-center",
        day_button:
          "text-foreground hover:bg-muted inline-flex size-11 items-center justify-center rounded-md text-body-sm tabular-nums outline-none transition-colors motion-reduce:transition-none focus-ring disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40",
        today: "[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        outside: "[&>button]:text-muted-foreground",
        disabled: "",
        hidden: "invisible",
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron, Dropdown: CalendarDropdown, ...components }}
      {...props}
    />
  )
}

export { Calendar }
