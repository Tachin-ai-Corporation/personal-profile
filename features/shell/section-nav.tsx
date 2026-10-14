"use client"

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject, type SyntheticEvent } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { isProfileSectionId, PROFILE_SECTION_IDS, PROFILE_SECTIONS, PROFILE_SUB_ANCHORS, sectionHeadingId, type ProfileSectionId } from "./anchors"
import { isPlainClick } from "./page-nav"
import { HAND_SCROLL_IGNORE_ATTR, onHandScroll } from "./hand-scroll"
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
 *   choosing one (the current one included) moves focus to the Section's `h2`
 *   when the listbox closes.
 * - **Activation** (click, Enter or Space; or a Jump to choice): scroll the
 *   Section into view (smooth, or instant under reduced motion), focus its
 *   `h2` without scrolling, and `history.replaceState` the hash (other params
 *   kept). It is not a navigation: it never asks the leave guard, so a dirty
 *   Section stays dirty and no dialog opens.
 * - **Scroll-spy:** an IntersectionObserver (`rootMargin "0px 0px -60% 0px"`)
 *   marks exactly one item `aria-current="location"`: the top-most Section in
 *   view, the first when none is, the last when the page is scrolled to its
 *   end. An activated or deep-linked Section stays current until it first
 *   enters view, then while it is in view, until the user scrolls by hand
 *   (`onHandScroll`: wheel, touch, scroll keys outside the menu, Jump to and
 *   editable fields, a scrollbar press).
 * - **Deep links:** `useHashAnchors` (mount and `hashchange`, `#signature` →
 *   the Signature row, unknown hashes ignored, one re-scroll when the target
 *   frame becomes ready).
 * - Modified or non-primary clicks keep the browser's own behavior.
 * =============================================================================
 */

export interface SectionNavState {
  readonly activeId: ProfileSectionId
  /** Scroll to the Section, focus its `h2`, replace the hash. */
  activate(id: ProfileSectionId): void
  /** Jump to: remember the choice until the listbox closes. */
  choose(id: ProfileSectionId): void
  /** Jump to: the listbox is being dismissed (Escape, outside press); forget any remembered choice. */
  dismissListbox(): void
  /** Jump to: the listbox closed; returns `true` when a choice was activated. */
  closeListbox(): boolean
  readonly navRef: RefObject<HTMLElement | null>
  /** Pass to each Section frame's `onReady` (`StateFrame`), for the deep-link re-scroll. */
  frameReady(frameId: string): void
}

/** Whether the page is scrollable and scrolled to its end (1 px of rounding allowed). */
function isScrolledToEnd(): boolean {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 && window.scrollY >= max - 1
}

const LAST_SECTION_ID = PROFILE_SECTION_IDS[PROFILE_SECTION_IDS.length - 1]

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
    // At the end of the page the last Section can never reach the top 40 %: make it current.
    if (isScrolledToEnd()) {
      setActiveId(LAST_SECTION_ID)
      return
    }
    setActiveId(PROFILE_SECTION_IDS.find((id) => visible.current.has(id)) ?? PROFILE_SECTION_IDS[0])
  }, [])

  const { frameReady, cancelPending } = useHashAnchors(PROFILE_SECTION_IDS, {
    subAnchors: PROFILE_SUB_ANCHORS,
    onFollow: (frame) => {
      if (isProfileSectionId(frame)) pin(frame)
    },
  })

  const activate = useCallback(
    (id: ProfileSectionId) => {
      const section = document.getElementById(id)
      if (!section) return
      // The user chose a Section: an earlier deep link's re-scroll must not pull them back.
      cancelPending()
      pin(id)
      section.scrollIntoView({ behavior: motionAwareScrollBehavior(), block: "start" })
      document.getElementById(sectionHeadingId(id))?.focus({ preventScroll: true })
      const { pathname, search } = window.location
      // `null` state: Next's patched history keeps `useSearchParams` in sync. No navigate(): not a leave.
      window.history.replaceState(null, "", `${pathname}${search}#${id}`)
    },
    [pin, cancelPending],
  )

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

  // Reaching (or leaving) the end of the page changes no intersection: recompute on scroll too.
  useEffect(() => {
    window.addEventListener("scroll", recompute, { passive: true })
    return () => window.removeEventListener("scroll", recompute)
  }, [recompute])

  // A hand scroll ends the pin.
  useEffect(
    () =>
      onHandScroll(() => {
        if (pinned.current === null) return
        pinned.current = null
        recompute()
      }),
    [recompute],
  )

  return {
    activeId,
    activate,
    choose(id) {
      pendingJump.current = id
      setActiveId(id)
    },
    dismissListbox() {
      pendingJump.current = null
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
  const triggerId = useId()
  const labelId = useId()

  const onMenuClick = (event: MouseEvent<HTMLAnchorElement>, id: ProfileSectionId): void => {
    if (!isPlainClick(event)) return
    event.preventDefault()
    activate(id)
  }
  const onMenuKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, id: ProfileSectionId): void => {
    // Enter activates through the link's own click; Space does not, so handle it (once: a held Space repeats).
    if (event.key !== " ") return
    event.preventDefault()
    if (event.repeat) return
    activate(id)
  }

  /** A Jump to pick: Radix prevents the pointerup that only ends the opening press. */
  const pick = (event: SyntheticEvent, id: ProfileSectionId): void => {
    if (!event.defaultPrevented) state.choose(id)
  }

  return (
    <>
      <div className="hidden border-r md:block">
        <nav ref={navRef} {...{ [HAND_SCROLL_IGNORE_ATTR]: "" }} aria-label={SHELL_MESSAGES.sectionsNavLabel} className="sticky top-0 py-4">
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
        <label id={labelId} htmlFor={triggerId} className="text-muted-foreground text-body-sm whitespace-nowrap">
          {SHELL_MESSAGES.jumpTo}
        </label>
        <Select
          value={activeId}
          onValueChange={(value) => {
            if (isProfileSectionId(value)) state.choose(value)
          }}
        >
          <SelectTrigger id={triggerId} aria-labelledby={labelId} {...{ [HAND_SCROLL_IGNORE_ATTR]: "" }} className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            {...{ [HAND_SCROLL_IGNORE_ATTR]: "" }}
            onEscapeKeyDown={state.dismissListbox}
            onPointerDownOutside={state.dismissListbox}
            onCloseAutoFocus={(event) => {
              // The listbox would return focus to the trigger; a choice moves it to the Section h2 instead.
              if (state.closeListbox()) event.preventDefault()
            }}
          >
            {PROFILE_SECTIONS.map((section) => (
              <SelectItem
                key={section.id}
                value={section.id}
                // Radix skips onValueChange when the current Section is picked again: remember every pick here.
                onClick={(event) => pick(event, section.id)}
                onPointerUp={(event) => pick(event, section.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") pick(event, section.id)
                }}
              >
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
