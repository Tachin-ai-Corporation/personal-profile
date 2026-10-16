"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DESKTOP_QUERY,
  motionAwareScrollBehavior,
  runSaveAll,
  SAVE_ORDER,
  saveAllSummary,
  sectionHeadingId,
  toastPartial,
  toastSuccess,
  useDirtyCount,
  useMediaQuery,
  useSectionRegistry,
  type SectionId,
  type SectionRef,
} from "@/features/shell"
import { formatMessage, SECTION_MESSAGES } from "@/lib/shared/messages"
import { useOnScreenKeyboard } from "./use-on-screen-keyboard"

/** The CSS property the toast viewport reads (`components/ui/toast.tsx`, `app/globals.css`). */
export const TOAST_OFFSET_PROPERTY = "--toast-bottom-offset"

/** Toasts sit above the pill: its 16 px gap from the bottom edge, its 44 px height and a margin. */
export const PILL_TOAST_OFFSET = "4.5rem"

/**
 * The bar's measured height, set on the bar itself. Its sticky `top` is
 * `100dvh` minus it, so on a page shorter than the viewport the bar still
 * sits on the bottom edge (the page frame is at least one screen tall), and
 * on a longer page `bottom: 0` keeps it there.
 */
const BAR_HEIGHT_PROPERTY = "--save-all-bar-height"

/** A failed Section's first invalid control, else its error banner (`SectionFooter` `InlineBanner`). */
const FAILED_TARGETS = ['[aria-invalid="true"]', '[data-slot~="inline-banner"][data-variant="error"]'] as const

/**
 * Where focus goes once the Sections have rendered a run's (or Discard all's)
 * result. A new object per request, so the same target can be asked twice.
 */
type FocusRequest =
  /** The run came back `invalid`: the field `focusFirstInvalid()` focused scrolls into view. */
  | { readonly kind: "invalid" }
  /** The first failed Section: its first invalid control or error banner, else its `h2`. */
  | { readonly kind: "failed"; readonly id: SectionId }
  /** A Section's `h2`: the first saved one, or the first discarded one. */
  | { readonly kind: "heading"; readonly id: SectionId }

function reveal(target: Element | null): void {
  if (!(target instanceof HTMLElement) || target === document.body) return
  target.scrollIntoView({ behavior: motionAwareScrollBehavior(), block: "center" })
}

function focusAndReveal(target: HTMLElement | null): void {
  if (!target) return
  target.focus({ preventScroll: true })
  reveal(target)
}

function failedTarget(id: SectionId): HTMLElement | null {
  const section = document.querySelector<HTMLElement>(`section[id="${id}"]`)
  for (const selector of FAILED_TARGETS) {
    const found = section?.querySelector<HTMLElement>(selector)
    if (found) return found
  }
  return document.getElementById(sectionHeadingId(id))
}

/**
 * The Save all bar and pill on `/` (Story 1.14; FR5, UX-DR31/32/57, AD-8),
 * shown while at least one Save-all Section is dirty and gone at 0.
 *
 * - From 768 px, a sticky bottom bar: the warning dot, "{N} unsaved
 *   section(s)", a sub-line naming the invalid Sections after a run that
 *   found any, then Discard all and Save all (N).
 * - Below 768 px, a centered floating pill "Save all (N)" (no Discard),
 *   hidden while the on-screen keyboard is open.
 *
 * Save all runs `runSaveAll(registry, { order: SAVE_ORDER })` (the D-A batch
 * check included), shows the one summary toast and moves focus to the first
 * failed Section's error (or its `h2`), else the first saved `h2`. Discard
 * all reverts every dirty Save-all Section with no confirm. While shown, the
 * bar or pill raises `--toast-bottom-offset`, so toasts never cover it.
 */
export function SaveAllBar() {
  const count = useDirtyCount()
  const registry = useSectionRegistry()
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const keyboardOpen = useOnScreenKeyboard()
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  /** The last invalid run's lines, each with its Section: only a still-dirty Section's line shows. */
  const [subLine, setSubLine] = useState<readonly { readonly id: SectionId; readonly line: string }[]>([])
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const mode = count === 0 ? null : desktop ? "bar" : keyboardOpen ? null : "pill"

  // The sub-line belongs to the last run: it goes once nothing is dirty (adjusted while rendering).
  const [previousCount, setPreviousCount] = useState(count)
  if (count !== previousCount) {
    setPreviousCount(count)
    if (count === 0) setSubLine([])
  }

  useLayoutEffect(() => {
    if (mode === null) return
    const root = document.documentElement
    if (mode === "pill") {
      root.style.setProperty(TOAST_OFFSET_PROPERTY, PILL_TOAST_OFFSET)
      return () => root.style.removeProperty(TOAST_OFFSET_PROPERTY)
    }
    const bar = barRef.current
    if (!bar) return
    const apply = (): void => {
      const height = `${bar.getBoundingClientRect().height}px`
      bar.style.setProperty(BAR_HEIGHT_PROPERTY, height)
      root.style.setProperty(TOAST_OFFSET_PROPERTY, height)
    }
    apply()
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null
    observer?.observe(bar)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(TOAST_OFFSET_PROPERTY)
    }
  }, [mode])

  // Runs after the commit that rendered the Sections' results (their errors, their read views).
  useEffect(() => {
    if (focusRequest === null) return
    if (focusRequest.kind === "invalid") {
      // Focus may be deferred to the Section's own effect, or nothing took it: never scroll the bar's own button.
      const active = document.activeElement
      if (!active?.closest('[data-slot="save-all-bar"],[data-slot="save-all-pill"]')) reveal(active)
    }
    else if (focusRequest.kind === "failed") focusAndReveal(failedTarget(focusRequest.id))
    else focusAndReveal(document.getElementById(sectionHeadingId(focusRequest.id)))
  }, [focusRequest])

  /** The first of `refs` in page (`displayOrder`) order, not save order. */
  function firstInPageOrder(refs: readonly SectionRef[]): SectionId | undefined {
    const rank = (ref: SectionRef): number => registry.get(ref.id)?.displayOrder ?? Number.POSITIVE_INFINITY
    return refs.toSorted((a, b) => rank(a) - rank(b))[0]?.id
  }

  async function saveAll(): Promise<void> {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setSubLine([])
    try {
      const outcome = await runSaveAll(registry, { order: SAVE_ORDER })
      // `clean` and `session`: no toast and no focus move (the session dialog takes over).
      if (outcome.kind === "invalid") {
        const summary = saveAllSummary(outcome)
        // `lines` follows `outcome.invalid` one to one (page order).
        const lines = summary?.tone === "invalid" ? summary.lines : []
        setSubLine(outcome.invalid.map(({ id }, index) => ({ id, line: lines[index] })).filter(({ line }) => line !== undefined))
        outcome.focusFirstInvalid()
        setFocusRequest({ kind: "invalid" })
      } else if (outcome.kind === "done") {
        const summary = saveAllSummary(outcome)
        if (summary?.tone === "success") toastSuccess(summary.text)
        else if (summary?.tone === "partial") toastPartial(summary.text)
        const failed = firstInPageOrder(outcome.failed)
        const saved = firstInPageOrder(outcome.saved)
        if (failed !== undefined) setFocusRequest({ kind: "failed", id: failed })
        else if (saved !== undefined) setFocusRequest({ kind: "heading", id: saved })
      }
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  function discardAll(): void {
    if (runningRef.current) return
    const dirty = registry.getDirty().filter((section) => section.saveAll)
    for (const section of dirty) section.discard()
    setSubLine([])
    // The bar unmounts: focus would drop to <body>.
    if (dirty[0]) setFocusRequest({ kind: "heading", id: dirty[0].id })
  }

  if (mode === null) return null

  const saveAllLabel = formatMessage(SECTION_MESSAGES.saveAllCount, { count })
  const saveAllButton = (className?: string) => (
    <Button type="button" size="touch" busy={running} busyLabel={SECTION_MESSAGES.saving} onClick={() => void saveAll()} className={className}>
      {saveAllLabel}
    </Button>
  )

  if (mode === "pill") {
    return (
      <>
        {/* In-flow room for the fixed pill, so it never covers the end of the page. */}
        <div aria-hidden="true" data-slot="save-all-pill-spacer" style={{ height: PILL_TOAST_OFFSET }} />
        <div data-slot="save-all-pill" className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          {saveAllButton("pointer-events-auto rounded-full px-6 shadow-md")}
        </div>
      </>
    )
  }

  return (
    <div
      ref={barRef}
      data-slot="save-all-bar"
      className="bg-card text-card-foreground border-border sticky top-[calc(100dvh-var(--save-all-bar-height))] bottom-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-6 py-1.5"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
        <span aria-hidden="true" className="bg-warning size-2 shrink-0 rounded-full" />
        <p role="status" data-slot="save-all-count" className="text-body-sm text-foreground font-semibold">
          {formatMessage(count === 1 ? SECTION_MESSAGES.unsavedOne : SECTION_MESSAGES.unsavedMany, { count })}
        </p>
        <p role="status" data-slot="save-all-subline" className="text-body-sm text-muted-foreground flex min-w-0 flex-wrap gap-x-3">
          {subLine
            .filter(({ id }) => registry.get(id)?.isDirty)
            .map(({ id, line }) => (
              <span key={id}>{line}</span>
            ))}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="touch" aria-disabled={running || undefined} onClick={discardAll}>
          {SECTION_MESSAGES.discardAll}
        </Button>
        {saveAllButton()}
      </div>
    </div>
  )
}
