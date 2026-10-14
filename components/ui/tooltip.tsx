"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

/**
 * shadcn Tooltip on `@radix-ui/react-tooltip` (pinned), styled with the
 * DESIGN.md `tooltip` component: `tooltip` / `tooltip-foreground` tokens,
 * caption type, 6 px radius and padding 6 × 10, a 6 px arrow, above the
 * control, elevation-1 (`shadow-md`). One line on desktop (wraps on mobile);
 * `wide` caps it at 320 px and wraps on every width (e.g. the Birth date help).
 */
export const TOOLTIP_CONTENT_STYLES =
  "bg-tooltip text-tooltip-foreground z-50 rounded-sm px-2.5 py-1.5 text-caption shadow-md max-w-[calc(100vw-2rem)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none"

/** App-wide hover timing: a short open delay, and no delay while moving between triggers (no flicker in dense rows). */
export const TOOLTIP_DELAY_MS = 300
export const TOOLTIP_SKIP_DELAY_MS = 300

const HasTooltipProvider = React.createContext(false)

/**
 * The one app-level tooltip provider (mounted in `app/layout.tsx`): every
 * `Tooltip` below it shares the delay and skip-delay timing.
 */
export function TooltipProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}>
      <HasTooltipProvider.Provider value={true}>{children}</HasTooltipProvider.Provider>
    </TooltipPrimitive.Provider>
  )
}

export interface TooltipProps {
  /** The tooltip text. Empty (`null`, `undefined`, `false`, `""`) renders only the trigger: no popup, no description. */
  readonly content: React.ReactNode
  /** The trigger: one element that forwards its ref and props (a Button, `InfoIconButton`, …). */
  readonly children: React.ReactElement
  /** Wraps on every width, capped at 320 px (`max-w-80`). */
  readonly wide?: boolean
  readonly side?: "top" | "right" | "bottom" | "left"
  /** An id for the tooltip content (the `role="tooltip"` element). */
  readonly contentId?: string
  readonly contentClassName?: string
  /**
   * Pressing the trigger (pointerdown, click) never closes the tooltip. For
   * triggers whose press does nothing (`DisabledAction`), so a mouse click
   * keeps the reason on screen.
   */
  readonly keepOpenOnPress?: boolean
}

/** Touch and pen get no hover, so a tap toggles the tooltip. */
const isTapPointer = (pointerType: string | null | undefined): boolean => pointerType === "touch" || pointerType === "pen"

/**
 * Opens on hover, keyboard focus and tap; closes on Escape, blur, pointer
 * leave and a tap outside (EXPERIENCE.md Tooltip). Radix ignores touch, so the
 * open state is controlled here: a tap (touch or pen) toggles it from its
 * state when the press began, and the closes Radix sends from that same press
 * are ignored. A keyboard-made click (`detail` 0) is never a tap. Without an
 * app-level `TooltipProvider` (isolated tests, fixtures) it brings its own.
 */
export function Tooltip(props: TooltipProps): React.JSX.Element {
  const hasProvider = React.useContext(HasTooltipProvider)
  if (props.content === null || props.content === undefined || props.content === false || props.content === "") return props.children
  if (hasProvider) return <TooltipRoot {...props} />
  return (
    <TooltipProvider>
      <TooltipRoot {...props} />
    </TooltipProvider>
  )
}

function TooltipRoot({ content, children, wide = false, side = "top", contentId, contentClassName, keepOpenOnPress = false }: TooltipProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  /** The pointer type of the press in progress on the trigger; cleared on pointercancel and shortly after pointerup. */
  const pointerTypeRef = React.useRef<string | null>(null)
  /**
   * Whether the tooltip was open when that press began. A tap toggles from
   * this, not from the current state: the browser focuses the trigger during
   * the tap, and that focus already opens it.
   */
  const openAtPressRef = React.useRef(false)
  /** True only while the trigger's own press events run (Radix closes on pointerdown and click). */
  const ignoreCloseRef = React.useRef(false)
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => () => clearTimeout(resetTimerRef.current), [])

  const ignoreTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  React.useEffect(() => () => clearTimeout(ignoreTimerRef.current), [])

  /**
   * Ignores closes until the current event's task ends. A task, not a
   * microtask: the browser runs microtasks between React's capture and bubble
   * listeners of one click, and Radix closes in the bubble phase.
   */
  const ignoreClosesForThisEvent = (): void => {
    ignoreCloseRef.current = true
    clearTimeout(ignoreTimerRef.current)
    ignoreTimerRef.current = setTimeout(() => {
      ignoreCloseRef.current = false
    }, 0)
  }
  const resetPointer = (): void => {
    clearTimeout(resetTimerRef.current)
    pointerTypeRef.current = null
  }

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && ignoreCloseRef.current) return
        setOpen(next)
      }}
    >
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={(event) => {
          clearTimeout(resetTimerRef.current)
          pointerTypeRef.current = event.pointerType
          openAtPressRef.current = open
          if (keepOpenOnPress || isTapPointer(event.pointerType)) ignoreClosesForThisEvent()
        }}
        onPointerUp={() => {
          // A press that ends without a click (e.g. the finger moved away) must not make a later click look like a tap.
          clearTimeout(resetTimerRef.current)
          resetTimerRef.current = setTimeout(resetPointer, 1000)
        }}
        onPointerCancel={resetPointer}
        // Capture phase: runs even when the trigger swallows its own click (an inert Button), and before Radix's close.
        onClickCapture={(event) => {
          const pointerType = (event.nativeEvent as Partial<PointerEvent>).pointerType || pointerTypeRef.current
          const tapped = event.detail !== 0 && isTapPointer(pointerType)
          resetPointer()
          if (keepOpenOnPress) ignoreClosesForThisEvent()
          if (!tapped) return
          ignoreClosesForThisEvent()
          setOpen(!openAtPressRef.current)
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          id={contentId}
          side={side}
          sideOffset={4}
          collisionPadding={16}
          data-slot="tooltip-content"
          className={cn(TOOLTIP_CONTENT_STYLES, wide ? "max-w-80 whitespace-normal" : "md:whitespace-nowrap", contentClassName)}
        >
          {content}
          <TooltipPrimitive.Arrow width={12} height={6} className="fill-tooltip" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
