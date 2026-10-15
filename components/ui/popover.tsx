"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

/**
 * shadcn Popover on `@radix-ui/react-popover` (pinned 1.1.23), on 1health
 * tokens (DESIGN.md: popover fill and text, `rounded-md`, elevation-2
 * `shadow-lg`, no scrim). Non-modal unless a caller asks otherwise. Content
 * opens below its trigger with the left edges aligned and flips above only
 * when there is no room below (PM10).
 */
function Popover({ modal = false, ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" modal={modal} {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export const POPOVER_CONTENT_STYLES =
  "bg-popover text-popover-foreground z-50 rounded-md border shadow-lg outline-none max-w-[calc(100vw-2rem)] origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none"

function PopoverContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  collisionPadding = 16,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        avoidCollisions
        className={cn(POPOVER_CONTENT_STYLES, className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
