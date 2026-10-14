"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { isProfileSectionId, PROFILE_SECTION_IDS, PROFILE_SECTIONS, PROFILE_SUB_ANCHORS, sectionHeadingId, type ProfileSectionId } from "./anchors"
import { isPlainClick } from "./page-nav"
import { useSectionCounts } from "./section-counts"
import { motionAwareScrollBehavior, useHashAnchors } from "./use-hash-anchors"

/**
 * =============================================================================
 * Section navigation on the Contacts tab (F3-3, port of main's Story 1.8B)
 * =============================================================================
 *
 * - **Menu (≥ 768 px):** a sticky 200 px `<nav aria-label="Sections">` of five
 *   `href="#<id>"` links: mono number, label, mono saved-entry count.
 * - **Jump to (< 768 px):** a full-width Select with the same five targets;
 *   choosing one moves focus to the Section's `h2` when the listbox closes.
 * - **Activation** (click, Enter or Space; or a Jump to choice): scroll the
 *   Section into view (smooth, or instant under reduced motion), focus its
 *   `h2` without scrolling, and `history.replaceState` the hash (other params
 *   kept). It is not a navigation: it never asks the leave guard, so a dirty
 *   Section stays dirty and no dialog opens.
 * - **Scroll-spy:** an IntersectionObserver (`rootMargin "0px 0px -60% 0px"`)
 *   marks exactly one item `aria-current="location"`: the top-most Section in
 *   view, the first when none is. An activated or deep-linked Section stays
 *   current until it first enters view, then while it is in view, until the
 *   user scrolls by hand (wheel, touch, scroll keys outside the menu).
 * - **Deep links:** `useHashAnchors` (mount and `hashchange`, `#signature` →
 *   the Signature row, unknown hashes ignored, one re-scroll when the target
 *   frame becomes ready).
 * - Modified or non-primary clicks keep the browser's own behavior.
 * =============================================================================
 */

/** Keys that scroll the page; pressing one outside the menu ends the pin. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

export interface SectionNavState {
  readonly activeId: ProfileSectionId
  /** Scroll to the Section, focus its `h2`, replace the hash. */
  activate(id: ProfileSectionId): void
  /** Jump to: remember the choice until the listbox closes. */
  choose(id: ProfileSectionId): void
  /** Jump to: the listbox closed; returns `true` when a choice was activated. */
  closeListbox(): boolean
  readonly navRef: RefObject<HTMLElement | null>
  /** Pass to each Section frame's `onReady` (`StateFrame`), for the deep-link re-scroll. */
  frameReady(frameId: string): void
}

/** The Contacts tab's Section navigation state: scroll-spy, pin, activation and deep links. */
export function useSectionNavigation(): SectionNavState {
  const [activeId, setActiveId] = useState<ProfileSectionId>(PROFILE_SECTION_IDS[0])
  const visible = useRef(new Set<ProfileSectionId>())
  /** The last activated / deep-linked Section (see the file header). */
  const pinned = useRef<{ id: ProfileSectionId; reached: boolean } | null>(null)
  const pendingJump = useRef<ProfileSectionId | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const pin = useCallback((id: ProfileSectionId) => {
    pinned.current = { id, reached: false }
    setActiveId(id)
  }, [])

  const recompute = useCallback(() => {
    const current = pinned.current
    if (current) {
      if (visible.current.has(current.id)) current.reached = true
      if (visible.current.has(current.id) || !current.reached) {
        setActiveId(current.id)
        return
      }
    }
    setActiveId(PROFILE_SECTION_IDS.find((id) => visible.current.has(id)) ?? PROFILE_SECTION_IDS[0])
  }, [])

  const activate = useCallback(
    (id: ProfileSectionId) => {
      const section = document.getElementById(id)
      if (!section) return
      pin(id)
      section.scrollIntoView({ behavior: motionAwareScrollBehavior(), block: "start" })
      document.getElementById(sectionHeadingId(id))?.focus({ preventScroll: true })
      const { pathname, search } = window.location
      // `null` state: Next's patched history keeps `useSearchParams` in sync. No navigate(): not a leave.
      window.history.replaceState(null, "", `${pathname}${search}#${id}`)
    },
    [pin],
  )

  const { frameReady } = useHashAnchors(PROFILE_SECTION_IDS, {
    subAnchors: PROFILE_SUB_ANCHORS,
    onFollow: (frame) => {
      if (isProfileSectionId(frame)) pin(frame)
    },
  })

  // Scroll-spy.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const seen = visible.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const { id } = entry.target
          if (!isProfileSectionId(id)) continue
          if (entry.isIntersecting) seen.add(id)
          else seen.delete(id)
        }
        recompute()
      },
      { rootMargin: "0px 0px -60% 0px" },
    )
    for (const id of PROFILE_SECTION_IDS) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => {
      observer.disconnect()
      seen.clear()
    }
  }, [recompute])

  // A hand scroll ends the pin.
  useEffect(() => {
    const unpin = (): void => {
      if (pinned.current === null) return
      pinned.current = null
      recompute()
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (!SCROLL_KEYS.has(event.key)) return
      if (event.target instanceof Node && navRef.current?.contains(event.target)) return
      unpin()
    }
    window.addEventListener("wheel", unpin, { passive: true })
    window.addEventListener("touchmove", unpin, { passive: true })
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("wheel", unpin)
      window.removeEventListener("touchmove", unpin)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [recompute])

  return {
    activeId,
    activate,
    choose(id) {
      pendingJump.current = id
      setActiveId(id)
    },
    closeListbox() {
      const id = pendingJump.current
      if (!id) return false
      pendingJump.current = null
      activate(id)
      return true
    },
    navRef,
    frameReady,
  }
}

export interface SectionNavProps {
  readonly state: SectionNavState
}

/** The Section menu (≥ 768 px) and Jump to (< 768 px) for the Contacts tab. */
export function SectionNav({ state }: SectionNavProps) {
  const counts = useSectionCounts()
  const { activeId, activate, navRef } = state

  const onMenuClick = (event: MouseEvent<HTMLAnchorElement>, id: ProfileSectionId): void => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    activate(id)
  }
  const onMenuKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, id: ProfileSectionId): void => {
    // Enter activates through the link's own click; Space does not, so handle it.
    if (event.key !== " ") return
    event.preventDefault()
    activate(id)
  }

  return (
    <>
      <div className="hidden border-r md:block">
        <nav ref={navRef} aria-label={SHELL_MESSAGES.sectionsNavLabel} className="sticky top-0 py-4">
          <ol>
            {PROFILE_SECTIONS.map((section) => {
              const current = section.id === activeId
              const count = counts[section.id]
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={current ? "location" : undefined}
                    onClick={(event) => onMenuClick(event, section.id)}
                    onKeyDown={(event) => onMenuKeyDown(event, section.id)}
                    className={cn(
                      "focus-ring text-foreground hover:bg-accent relative grid min-h-11 grid-cols-[24px_1fr_auto] items-center pr-4 pl-5 text-body-sm tabular-nums outline-none",
                      // The 3 px bar is a pseudo-element: focus-ring's glow would replace an inset box-shadow.
                      current &&
                        "bg-accent text-primary-text before:bg-primary font-semibold before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
                    )}
                  >
                    <span aria-hidden="true" className={cn("text-muted-foreground font-mono text-caption", current && "text-primary-text")}>
                      {section.number}
                    </span>
                    <span>{section.label}</span>
                    {/* aria-hidden: the Section's own header carries its count (DESIGN.md Section header). */}
                    <span
                      aria-hidden="true"
                      data-slot="section-count"
                      className={cn("text-muted-foreground font-mono text-caption", current && "text-primary-text")}
                    >
                      {count ?? null}
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
        <label id="jump-to-label" htmlFor="jump-to-trigger" className="text-muted-foreground text-body-sm whitespace-nowrap">
          {SHELL_MESSAGES.jumpTo}
        </label>
        <Select
          value={activeId}
          onValueChange={(value) => {
            if (isProfileSectionId(value)) state.choose(value)
          }}
        >
          <SelectTrigger id="jump-to-trigger" aria-labelledby="jump-to-label" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            onCloseAutoFocus={(event) => {
              // The listbox would return focus to the trigger; a choice moves it to the Section h2 instead.
              if (state.closeListbox()) event.preventDefault()
            }}
          >
            {PROFILE_SECTIONS.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                <span aria-hidden="true" className="text-muted-foreground font-mono text-caption">
                  {section.number}
                </span>
                <span>{section.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
