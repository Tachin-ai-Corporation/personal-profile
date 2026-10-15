"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * shadcn Tabs on `@radix-ui/react-tabs` (pinned), styled with the DESIGN.md
 * `tab` / `tab-active` tokens. ARIA tabs semantics, roving focus (Left/Right
 * wrap, Home/End) come from Radix; `activationMode` defaults to "manual" so
 * Enter or Space activates the focused tab (Story 1.8).
 */
function Tabs({ activationMode = "manual", className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" activationMode={activationMode} className={cn("flex flex-col", className)} {...props} />
}

/**
 * The strip: scrolls inside itself on narrow screens. `relative` makes it the
 * triggers' offsetParent (scroll-into-view). The strip rule is an inset
 * shadow, painted under the triggers, so the active underline covers it and
 * nothing is clipped by the scroll container.
 */
function TabsList({ className, loop = true, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      loop={loop}
      className={cn("relative flex w-full items-end overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // tab: 44 px, 12 px side padding, muted; tab-active: foreground 600 + 2 px primary underline over the strip rule.
        "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-body-sm font-medium text-muted-foreground",
        "transition-colors duration-150 ease-standard motion-reduce:transition-none hover:text-foreground",
        // Inset ring: fully visible inside the scrolling strip (an outset ring and glow would be clipped).
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        "data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
