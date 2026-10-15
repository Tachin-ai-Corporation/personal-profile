"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronLeft } from "lucide-react"

import { DialogOverlay, DialogPortal, ModalCloseButton, useModalHandlers, type ModalBehaviorProps } from "@/components/ui/dialog"
import { COMMON_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

/**
 * shadcn Sheet on the installed `@radix-ui/react-dialog` (F6-2; DESIGN.md
 * `insurance-drawer`, Story 5.2): from the right, 480 px wide, full height,
 * over the `scrim`, `shadow-lg`. Below 768 px it is a full-screen page whose
 * header shows a back control in place of close. Compose `SheetHeader`
 * (sticky; title + close/back), `SheetBody` (scrolls) and `SheetFooter`
 * (sticky). Close, back, Escape and the scrim all call `onOpenChange(false)`
 * on the root, so the caller can run its leave guard instead of closing.
 */
const SheetBehavior = React.createContext<{ readonly dismissible: boolean }>({ dismissible: true })

function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, ModalBehaviorProps {}

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  (
    { className, children, dismissible = true, initialFocus, onEscapeKeyDown, onPointerDownOutside, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus, ...props },
    ref,
  ) => {
    const behavior = React.useMemo(() => ({ dismissible }), [dismissible])
    const handlers = useModalHandlers({ dismissible, initialFocus }, { onEscapeKeyDown, onPointerDownOutside, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus })
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          data-slot="sheet-content"
          aria-busy={dismissible ? undefined : true}
          {...handlers}
          className={cn(
            "bg-card text-card-foreground fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col shadow-lg outline-none md:max-w-[480px] md:border-l",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right [animation-duration:250ms] [animation-timing-function:var(--ease-premium)] motion-reduce:animate-none",
            className,
          )}
          {...props}
        >
          <SheetBehavior.Provider value={behavior}>{children}</SheetBehavior.Provider>
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  },
)
SheetContent.displayName = "SheetContent"

export interface SheetHeaderProps extends React.ComponentProps<"div"> {
  /** The close button's name (desktop); defaults to the catalog's "Close". */
  readonly closeLabel?: string
  /** The back control's name (below 768 px); defaults to the catalog's "Back". */
  readonly backLabel?: string
}

/** Sticky header (min 60 px, bottom hairline): back control below 768 px, the title, close button from 768 px. */
function SheetHeader({ className, children, closeLabel, backLabel = COMMON_MESSAGES.back, ...props }: SheetHeaderProps) {
  const { dismissible } = React.useContext(SheetBehavior)
  return (
    <div data-slot="sheet-header" className={cn("border-border flex min-h-[60px] shrink-0 items-center gap-2 border-b px-4 md:px-6 md:pr-3", className)} {...props}>
      <ModalCloseButton dismissible={dismissible} label={backLabel} className="-ml-2 md:hidden">
        <ChevronLeft aria-hidden="true" />
      </ModalCloseButton>
      <div className="min-w-0 flex-1">{children}</div>
      <ModalCloseButton dismissible={dismissible} label={closeLabel} className="max-md:hidden" />
    </div>
  )
}

/** The scrolling form body (20 px top, 24 px sides and bottom). */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6 md:px-6", className)} {...props} />
}

/** Sticky footer (top hairline), actions right-aligned; pinned to the bottom edge on mobile. */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-footer" className={cn("border-border flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-4 md:px-6", className)} {...props} />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="sheet-title" className={cn("section-title truncate", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" className={cn("text-muted-foreground text-body-sm", className)} {...props} />
}

export { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger }
