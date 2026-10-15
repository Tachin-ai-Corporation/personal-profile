"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"

import { cn } from "@/lib/utils"

// shadcn/ui DropdownMenu on @radix-ui/react-dropdown-menu (pinned), styled as
// DESIGN.md `row-menu`: popover fill, `rounded-md`, `shadow-md` (elevation-1),
// 44 px items, the destructive item in `error-strong` text (F6-2). Row menus
// use `RowActions` (features/shell), which builds on these parts.

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuContent({ className, sideOffset = 4, align = "end", ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "bg-popover text-popover-foreground z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[12rem] max-w-[calc(100vw-2rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export interface DropdownMenuItemProps extends React.ComponentProps<typeof DropdownMenuPrimitive.Item> {
  /** `destructive` reads `error-strong` (e.g. "Remove"); red stays for destructive actions only. */
  readonly variant?: "default" | "destructive"
}

function DropdownMenuItem({ className, variant = "default", ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex min-h-11 cursor-default items-center gap-2 rounded-sm px-3 py-2 text-body-sm outline-hidden select-none",
        "data-[variant=destructive]:text-error-strong data-[variant=destructive]:focus:text-error-strong",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 aria-disabled:text-muted-foreground aria-disabled:cursor-not-allowed",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={cn("text-muted-foreground px-3 py-1.5 text-caption font-semibold", className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("bg-border -mx-1 my-1 h-px", className)} {...props} />
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger }
