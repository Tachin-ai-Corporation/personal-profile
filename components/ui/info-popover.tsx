"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { CONTROL_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

/** Hover-open waits this long, so passing the pointer over doesn't flash it (EXPERIENCE.md Info popover). */
export const INFO_POPOVER_HOVER_DELAY_MS = 150
/** Grace period for the pointer to travel between the trigger and the content. */
export const INFO_POPOVER_HOVER_CLOSE_MS = 100

/** The content states the callers fill only with their own content (Stories 9.1, 9.3, 10.2). */
export type InfoPopoverState = "loading" | "error" | "forbidden"

interface InfoPopoverBaseProps {
  /**
   * The trigger: one element that forwards its ref and props, an
   * `InfoIconButton` or a `LinkTextButton`. It gets `aria-expanded` and
   * `aria-controls`.
   */
  readonly trigger: React.ReactElement
  /** The content, shown when there is no `state`. */
  readonly children?: React.ReactNode
  /** Replaces the content: "Loading…", the load error with "Try again." (`onRetry`), or the no-access line. */
  readonly state?: InfoPopoverState
  /** The error line; defaults to the generic `CONTROL_MESSAGES.loadError` (Story 9.3 passes `NPI_MESSAGES.practiceSupportLoadError`). */
  readonly errorMessage?: React.ReactNode
  /** "Try again." in the error state calls it (focus moves into the popover first, so it is never lost). */
  readonly onRetry?: () => void
  /** Told on every open and close (e.g. fetch on first open). */
  readonly onOpenChange?: (open: boolean) => void
  readonly contentId?: string
  readonly contentClassName?: string
}

/** The popover always has a name: its `title` (bold first line, e.g. "Primary contact"), or else `label`. */
export type InfoPopoverProps = InfoPopoverBaseProps &
  ({ readonly title: React.ReactNode; readonly label?: string } | { readonly title?: undefined; readonly label: string })

type OpenReason = "hover" | "focus" | "click"

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(", ")

/** Rendered and visible: has boxes (not `display: none`) and isn't `visibility: hidden`. */
const isShown = (el: HTMLElement): boolean => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"

/** In the tab order: no negative `tabindex` (read from the attribute, as some DOMs report -1 for `summary` or editing hosts). */
const inTabOrder = (el: HTMLElement): boolean => {
  const explicit = el.getAttribute("tabindex")
  return explicit === null || Number(explicit) >= 0
}

/** Keyboard-reachable elements under `root`, in document order (Radix's focus guards and hidden elements excluded). */
export function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => inTabOrder(el) && !el.hasAttribute("data-radix-focus-guard") && !el.closest("[hidden], [inert]") && isShown(el),
  )
}

const isMouse = (event: React.PointerEvent): boolean => event.pointerType === "mouse"

/**
 * DESIGN.md `info-popover` (UX-DR-P18): a non-modal 280 px Popover (not a
 * Tooltip: it holds content and links), below its trigger, left edges aligned.
 *
 * - Opens on mouse hover after 150 ms (and closes once the pointer has left
 *   both trigger and content, unless it was pinned by a click), on keyboard
 *   focus of the trigger (focus stays on the trigger) and on click/tap. A
 *   press toggles from the state it began in (as in `tooltip.tsx`), so the
 *   focus a press causes never opens it first; a click on a hover-opened
 *   popover pins it.
 * - Closes on Escape (focus back to the trigger when it was inside), when
 *   focus leaves both trigger and content, and on an outside click.
 * - The content is portaled, so Tab is bridged: Tab on the trigger enters the
 *   content's links, Tab past the last one goes on to the element after the
 *   trigger, and Shift+Tab from the first returns to the trigger.
 */
export function InfoPopover({
  trigger,
  title,
  label,
  children,
  state,
  errorMessage = CONTROL_MESSAGES.loadError,
  onRetry,
  onOpenChange,
  contentId,
  contentClassName,
}: InfoPopoverProps): React.JSX.Element {
  const [open, setOpenState] = React.useState(false)
  const openRef = React.useRef(false)
  const reasonRef = React.useRef<OpenReason | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** The state when the current press on the trigger began; `null` when no press is in progress. */
  const pressRef = React.useRef<{ open: boolean; reason: OpenReason | null } | null>(null)
  /** True while the trigger is focused by the popover itself (Escape), so that focus doesn't reopen it. */
  const suppressFocusOpenRef = React.useRef(false)
  const titleId = `${React.useId()}-title`

  /** Removes the document listeners of the press in progress. */
  const stopWatchingPressRef = React.useRef<() => void>(() => {})

  React.useEffect(
    () => () => {
      clearTimeout(openTimerRef.current)
      clearTimeout(closeTimerRef.current)
      clearTimeout(pressTimerRef.current)
      stopWatchingPressRef.current()
    },
    [],
  )

  /** A press released or cancelled away from the trigger is over at once (no click follows on the trigger). */
  const watchPressEnd = (): void => {
    stopWatchingPressRef.current()
    const end = (event: Event): void => {
      stopWatchingPressRef.current()
      if (event.type === "pointercancel" || !(event.target instanceof Node) || !triggerRef.current?.contains(event.target)) pressRef.current = null
    }
    document.addEventListener("pointerup", end, true)
    document.addEventListener("pointercancel", end, true)
    stopWatchingPressRef.current = () => {
      document.removeEventListener("pointerup", end, true)
      document.removeEventListener("pointercancel", end, true)
      stopWatchingPressRef.current = () => {}
    }
  }

  const setOpen = (next: boolean, reason: OpenReason | null = null): void => {
    clearTimeout(openTimerRef.current)
    clearTimeout(closeTimerRef.current)
    reasonRef.current = next ? reason : null
    if (openRef.current === next) return
    openRef.current = next
    setOpenState(next)
    onOpenChange?.(next)
  }

  const scheduleHoverClose = (): void => {
    clearTimeout(openTimerRef.current)
    if (!openRef.current || reasonRef.current !== "hover") return
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpen(false), INFO_POPOVER_HOVER_CLOSE_MS)
  }

  const closeIfFocusLeft = (next: EventTarget | null): void => {
    // No new focus target (window switch, a click on plain text): an outside click closes it instead.
    if (!(next instanceof Node)) return
    if (triggerRef.current?.contains(next) || contentRef.current?.contains(next)) return
    if (openRef.current && reasonRef.current !== "hover") setOpen(false)
  }

  const focusTrigger = (): void => {
    suppressFocusOpenRef.current = true
    triggerRef.current?.focus()
    suppressFocusOpenRef.current = false
  }

  /** The first keyboard-reachable element after the trigger, outside the popover. */
  const nextAfterTrigger = (): HTMLElement | undefined => {
    const content = contentRef.current
    const all = tabbables(document.body).filter((el) => !content?.contains(el))
    const index = all.indexOf(triggerRef.current as HTMLElement)
    return index >= 0 ? all[index + 1] : undefined
  }

  const body = (() => {
    if (state === "loading") {
      return (
        <p role="status" className="text-muted-foreground flex items-center gap-2">
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
          {CONTROL_MESSAGES.loading}
        </p>
      )
    }
    if (state === "error") {
      return (
        <div className="flex flex-col items-start">
          <p>{errorMessage}</p>
          {onRetry ? (
            <LinkTextButton
              onClick={() => {
                // The button unmounts once the retry starts loading; keep focus inside the popover.
                contentRef.current?.focus()
                onRetry()
              }}
            >
              {CONTROL_MESSAGES.tryAgain}
            </LinkTextButton>
          ) : null}
        </div>
      )
    }
    if (state === "forbidden") return <p>{STATE_MESSAGES.noAccess}</p>
    return children
  })()

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next, "click")}>
      <PopoverTrigger
        ref={triggerRef}
        asChild
        {...(contentId ? { "aria-controls": contentId } : {})}
        onPointerEnter={(event) => {
          if (!isMouse(event)) return
          clearTimeout(closeTimerRef.current)
          if (openRef.current) return
          clearTimeout(openTimerRef.current)
          openTimerRef.current = setTimeout(() => setOpen(true, "hover"), INFO_POPOVER_HOVER_DELAY_MS)
        }}
        onPointerLeave={(event) => {
          if (isMouse(event)) scheduleHoverClose()
        }}
        onPointerDown={() => {
          clearTimeout(openTimerRef.current)
          clearTimeout(pressTimerRef.current)
          pressRef.current = { open: openRef.current, reason: reasonRef.current }
          watchPressEnd()
        }}
        onPointerUp={() => {
          // A press that ends without a click must not make a later keyboard focus look like a press.
          clearTimeout(pressTimerRef.current)
          pressTimerRef.current = setTimeout(() => {
            pressRef.current = null
          }, 1000)
        }}
        onPointerCancel={() => {
          pressRef.current = null
        }}
        onFocus={() => {
          if (suppressFocusOpenRef.current || pressRef.current) return
          // Already open on hover: keyboard focus now holds it open.
          setOpen(true, "focus")
        }}
        onBlur={(event) => closeIfFocusLeft(event.relatedTarget)}
        onClick={(event) => {
          // Handled here: Radix's own toggle is skipped.
          event.preventDefault()
          const press = event.detail === 0 ? null : pressRef.current
          pressRef.current = null
          clearTimeout(pressTimerRef.current)
          if (!press) setOpen(!openRef.current, "click")
          else if (press.open && press.reason === "hover") setOpen(true, "click")
          else setOpen(!press.open, "click")
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.shiftKey || !openRef.current) return
          const first = contentRef.current ? tabbables(contentRef.current)[0] : undefined
          if (!first) return
          event.preventDefault()
          first.focus()
        }}
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        {...(contentId ? { id: contentId } : {})}
        data-slot="info-popover"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        className={cn("w-70 p-4 text-body-sm", contentClassName)}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => {
          if (contentRef.current?.contains(document.activeElement)) focusTrigger()
        }}
        onPointerEnter={(event) => {
          if (isMouse(event)) clearTimeout(closeTimerRef.current)
        }}
        onPointerLeave={(event) => {
          if (isMouse(event)) scheduleHoverClose()
        }}
        onBlur={(event) => closeIfFocusLeft(event.relatedTarget)}
        onFocus={() => {
          // Focus inside holds it open: a hover-close timer must never unmount content that has focus.
          if (reasonRef.current !== "hover") return
          clearTimeout(closeTimerRef.current)
          reasonRef.current = "focus"
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return
          const list = tabbables(event.currentTarget)
          const index = list.indexOf(document.activeElement as HTMLElement)
          if (event.shiftKey) {
            if (index > 0) return
            event.preventDefault()
            focusTrigger()
            return
          }
          if (index >= 0 && index < list.length - 1) return
          if (index < 0 && list.length > 0) {
            // From the container itself (e.g. after "Try again."): into its first link.
            event.preventDefault()
            list[0].focus()
            return
          }
          const next = nextAfterTrigger()
          if (!next) {
            // The trigger is the page's last stop. Radix's focus scope (loop) would wrap Tab back to the first
            // link; instead the popover closes with focus on the trigger, so the next Tab leaves the page.
            // (An empty, focused container keeps focus: the scope holds it.)
            if (index < 0) return
            event.preventDefault()
            focusTrigger()
            setOpen(false)
            return
          }
          event.preventDefault()
          next.focus()
        }}
      >
        {title ? (
          <p id={titleId} className="text-foreground mb-2 font-semibold">
            {title}
          </p>
        ) : null}
        {body}
      </PopoverContent>
    </Popover>
  )
}

/**
 * A `link-text` styled button (e.g. the Practice name trigger, "Try again."):
 * 44 px tall target, underline on hover, the shared `focus-ring`.
 */
export const LinkTextButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function LinkTextButton(
  { className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-slot="link-text-button"
      className={cn(
        "text-link-text inline-flex min-h-11 items-center rounded-md text-left font-medium underline-offset-4 outline-none hover:underline focus-ring",
        className,
      )}
      {...props}
    />
  )
})
