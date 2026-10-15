'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { COMMON_MESSAGES } from '@/lib/shared/messages'
import { cn } from '@/lib/utils'

// Dialog is the root component for the modal dialog, using Radix UI's DialogPrimitive.Root.
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

// DialogTrigger is a button or element that opens the dialog when activated.
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

// DialogPortal renders the dialog in a React portal, outside the DOM hierarchy for accessibility.
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

// DialogClose is a button or element that closes the dialog when activated.
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// DialogOverlay is the scrim overlay (`bg-scrim`, D13) behind the dialog, rendered with forwardRef for accessibility and animation.
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-scrim motion-reduce:animate-none',
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

/**
 * The modal behaviour shared by `DialogContent` and `SheetContent` (F6-2):
 * while not `dismissible` (e.g. busy), Escape, a scrim press and the close
 * button do nothing; `initialFocus` names the element focused on open; on
 * close, focus returns to the element that was focused when it opened.
 */
export interface ModalBehaviorProps {
  /** `false` while busy: Escape, the scrim and the close button do nothing. Defaults to `true`. */
  readonly dismissible?: boolean
  /** The element focused when the dialog opens (Radix's default is the first focusable one). */
  readonly initialFocus?: React.RefObject<HTMLElement | null>
}

type ContentHandlers = Pick<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  'onEscapeKeyDown' | 'onPointerDownOutside' | 'onInteractOutside' | 'onOpenAutoFocus' | 'onCloseAutoFocus'
>

/**
 * The Radix content handlers with the `dismissible`, `initialFocus` and
 * return-focus rules. A caller's own handler runs first and may
 * `preventDefault()` to take over.
 */
export function useModalHandlers({ dismissible = true, initialFocus }: ModalBehaviorProps, handlers: ContentHandlers): Required<ContentHandlers> {
  // Radix's focus scope fires the open event before it moves focus, so the opener is still focused then.
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  const block = <E extends Event>(handler: ((event: E) => void) | undefined) => (event: E) => {
    handler?.(event)
    if (!dismissible) event.preventDefault()
  }
  return {
    onEscapeKeyDown: block(handlers.onEscapeKeyDown),
    onPointerDownOutside: block(handlers.onPointerDownOutside),
    onInteractOutside: block(handlers.onInteractOutside),
    onOpenAutoFocus: (event) => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      handlers.onOpenAutoFocus?.(event)
      if (event.defaultPrevented || !initialFocus?.current) return
      event.preventDefault()
      initialFocus.current.focus()
    },
    onCloseAutoFocus: (event) => {
      const target = returnFocusRef.current
      returnFocusRef.current = null
      handlers.onCloseAutoFocus?.(event)
      // Without a DialogTrigger Radix would focus nothing; an opener removed meanwhile is skipped.
      if (event.defaultPrevented || !target?.isConnected) return
      event.preventDefault()
      target.focus()
    },
  }
}

export interface ModalCloseButtonProps {
  readonly dismissible: boolean
  /** The accessible name; defaults to the catalog's "Close". */
  readonly label?: string
  readonly className?: string
  readonly children?: React.ReactNode
}

/**
 * A 44 px icon button that closes the dialog or sheet; `aria-disabled` and a
 * no-op while not dismissible (it keeps focus and its place in the tab order).
 */
export function ModalCloseButton({ dismissible, label = COMMON_MESSAGES.close, className, children }: ModalCloseButtonProps): React.JSX.Element {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      aria-label={label}
      aria-disabled={dismissible ? undefined : true}
      onClick={(event) => {
        if (!dismissible) event.preventDefault()
      }}
      className={cn(
        'focus-ring text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-5',
        className,
      )}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </DialogPrimitive.Close>
  )
}

const DIALOG_SIZES = {
  /** 440 px: DESIGN.md picture-dialog and qr-dialog. */
  default: 'max-w-[440px]',
  /** 640 px, for wider content (e.g. a card image). */
  lg: 'max-w-[640px]',
} as const

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, ModalBehaviorProps {
  readonly size?: keyof typeof DIALOG_SIZES
  /**
   * Below 768 px the dialog fills the viewport, the header and footer stay put
   * and only `DialogBody` scrolls (the Link authenticator dialog). Confirm
   * dialogs never do this. Defaults to `false`: centered with 16 px gutters.
   */
  readonly fullScreenOnMobile?: boolean
  readonly showCloseButton?: boolean
  /** The close button's name; defaults to the catalog's "Close". */
  readonly closeLabel?: string
}

/**
 * A modal dialog on the 1health tokens (F6-2): popover surface, `rounded-lg`,
 * `shadow-lg`, over the `scrim`, 440 px by default, with a 44 px close
 * button top-right. Compose `DialogHeader`, `DialogBody` and `DialogFooter`
 * inside: the content is a column whose body scrolls, so the header and
 * footer stay in place. The four data confirms use `ConfirmDialog`, not this.
 */
const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  (
    {
      className,
      children,
      size = 'default',
      fullScreenOnMobile = false,
      showCloseButton = true,
      closeLabel,
      dismissible = true,
      initialFocus,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      onOpenAutoFocus,
      onCloseAutoFocus,
      ...props
    },
    ref,
  ) => {
    const handlers = useModalHandlers({ dismissible, initialFocus }, { onEscapeKeyDown, onPointerDownOutside, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus })
    return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-slot="dialog-content"
        data-size={size}
        data-fullscreen-mobile={fullScreenOnMobile ? 'true' : undefined}
        aria-busy={dismissible ? undefined : true}
        {...handlers}
        className={cn(
          'group/dialog bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border shadow-lg outline-none',
          DIALOG_SIZES[size],
          fullScreenOnMobile &&
            'max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-none max-md:rounded-none max-md:border-0',
          // ease-premium entrance, 250 ms (none under reduced motion).
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 [animation-duration:250ms] [animation-timing-function:var(--ease-premium)] motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? <ModalCloseButton dismissible={dismissible} label={closeLabel} className="absolute top-3 right-3" /> : null}
      </DialogPrimitive.Content>
    </DialogPortal>
    )
  },
)
DialogContent.displayName = 'DialogContent'

// DialogHeader holds the title and description; it never scrolls (room on the right for the close button).
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex shrink-0 flex-col gap-2 px-6 pt-6 pr-16 pb-4', className)} {...props} />
}

// DialogBody is the dialog's scrolling region between the header and the footer.
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-body" className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-4', className)} {...props} />
}

// DialogFooter holds the actions, right-aligned; it never scrolls (pinned to the bottom edge when full-screen).
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex shrink-0 flex-wrap justify-end gap-2 px-6 pt-2 pb-6 max-md:group-data-[fullscreen-mobile=true]/dialog:border-t max-md:group-data-[fullscreen-mobile=true]/dialog:pt-4', className)}
      {...props}
    />
  )
}

// DialogTitle is the dialog's name (DESIGN.md section-title type).
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('section-title', className)}
      {...props}
    />
  )
}

// DialogDescription describes the dialog (muted cell type).
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-body-sm', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
