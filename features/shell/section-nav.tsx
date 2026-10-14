"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SHELL_COPY } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { isSectionId, SECTIONS, sectionHeadingId, SIGNATURE_ANCHOR, type SectionId } from "./sections"

/**
 * =============================================================================
 * Section navigation on the Contacts tab (Story 1.8, AD-7)
 * =============================================================================
 *
 * - **Menu (≥ 768 px):** a sticky `<nav aria-label="Sections">` of five
 *   `href="#<id>"` links (mono number, label, blank count slot).
 * - **Jump to (< 768 px):** a full-width Select with the same five targets.
 * - **Activation** (click, Enter or Space; or a Jump to choice): scroll the
 *   Section into view (smooth, or instant under reduced motion), focus its `h2`
 *   without scrolling, and `history.replaceState` to `?tab=contacts#<id>`, so no
 *   history entry is added and the server page is not re-rendered.
 * - **Scroll-spy:** an IntersectionObserver over the five Sections marks exactly
 *   one item `aria-current="location"`: the top-most Section in the top 40 % of
 *   the viewport (the first when none is). A just-activated Section stays
 *   current until it first enters view (no flicker during the smooth scroll),
 *   then while it is in view, until the user scrolls by hand, so the last
 *   Section (which can't reach the top of a short page) still shows as current.
 * - **Deep links:** on mount and on `hashchange`, `#personal|phone|email|social|
 *   addresses` scrolls to that Section and `#signature` to the Signature row.
 *   Any other hash is ignored. This component only mounts on the Contacts tab,
 *   so a hash on Insurance or Medical does nothing.
 * =============================================================================
 */

/** Keys that scroll the page; pressing one outside the menu ends the pin. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return reduce ? "auto" : "smooth"
}

/** Section menu + Jump to + scroll-spy + deep links for the Contacts tab. */
export function SectionNav() {
  const [activeId, setActiveId] = useState<SectionId>(SECTIONS[0].id)
  const visible = useRef(new Set<SectionId>())
  /**
   * The last activated / deep-linked Section. It stays current until it first
   * enters view (`reached`), so a smooth scroll past other Sections doesn't
   * flicker; after that it is current while in view.
   */
  const pinned = useRef<{ id: SectionId; reached: boolean } | null>(null)
  /** A Jump to choice waiting for the listbox to close (see onCloseAutoFocus). */
  const pendingJump = useRef<SectionId | null>(null)
  const navRef = useRef<HTMLElement>(null)

  const recompute = useCallback(() => {
    const pin = pinned.current
    if (pin) {
      if (visible.current.has(pin.id)) pin.reached = true
      if (visible.current.has(pin.id) || !pin.reached) {
        setActiveId(pin.id)
        return
      }
    }
    setActiveId(SECTIONS.find((s) => visible.current.has(s.id))?.id ?? SECTIONS[0].id)
  }, [])

  const activate = useCallback((id: SectionId) => {
    const section = document.getElementById(id)
    if (!section) return
    pinned.current = { id, reached: false }
    setActiveId(id)
    section.scrollIntoView({ behavior: scrollBehavior(), block: "start" })
    document.getElementById(sectionHeadingId(id))?.focus({ preventScroll: true })
    window.history.replaceState(null, "", `?tab=contacts#${id}`)
  }, [])

  // Scroll-spy.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const seen = visible.current
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id
        if (!isSectionId(id)) continue
        if (entry.isIntersecting) seen.add(id)
        else seen.delete(id)
      }
      recompute()
    }, { rootMargin: "0px 0px -60% 0px" })
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => {
      observer.disconnect()
      seen.clear()
    }
  }, [recompute])

  // A hand scroll ends the pin.
  useEffect(() => {
    const unpin = () => {
      if (pinned.current === null) return
      pinned.current = null
      recompute()
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!SCROLL_KEYS.has(e.key)) return
      if (e.target instanceof Node && navRef.current?.contains(e.target)) return
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

  // Deep links: on mount (instant) and on hashchange.
  useEffect(() => {
    const follow = (behavior: ScrollBehavior) => {
      let raw = window.location.hash.slice(1)
      try {
        raw = decodeURIComponent(raw)
      } catch {
        return
      }
      if (isSectionId(raw)) {
        pinned.current = { id: raw, reached: false }
        setActiveId(raw)
        document.getElementById(raw)?.scrollIntoView({ behavior, block: "start" })
      } else if (raw === SIGNATURE_ANCHOR) {
        pinned.current = { id: "personal", reached: false }
        setActiveId("personal")
        document.getElementById(SIGNATURE_ANCHOR)?.scrollIntoView({ behavior, block: "start" })
      }
    }
    follow("auto")
    const onHashChange = () => follow(scrollBehavior())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const onMenuClick = (e: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    // A modified or non-primary click keeps the browser's own behavior (new tab, ...).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    activate(id)
  }
  const onMenuKeyDown = (e: KeyboardEvent<HTMLAnchorElement>, id: SectionId) => {
    // Enter activates through the link's own click; Space does not, so handle it.
    if (e.key !== " ") return
    e.preventDefault()
    activate(id)
  }

  return (
    <>
      <div className="hidden border-r md:block">
        <nav ref={navRef} aria-label={SHELL_COPY.sectionsNav} className="sticky top-0 py-4">
          <ol>
            {SECTIONS.map((s) => {
              const current = s.id === activeId
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={current ? "location" : undefined}
                    onClick={(e) => onMenuClick(e, s.id)}
                    onKeyDown={(e) => onMenuKeyDown(e, s.id)}
                    className={cn(
                      "focus-ring relative grid min-h-11 grid-cols-[24px_1fr_auto] items-center pr-4 pl-5 text-body-sm text-foreground tabular-nums hover:bg-accent",
                      // The 3 px bar is a pseudo-element: focus-ring's glow would replace an inset box-shadow.
                      current &&
                        "bg-accent font-semibold text-primary before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary dark:text-info-strong",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "font-mono text-caption text-muted-foreground",
                        current && "text-primary dark:text-info-strong",
                      )}
                    >
                      {s.number}
                    </span>
                    <span>{s.label}</span>
                    <span
                      data-slot="section-count"
                      className={cn(
                        "font-mono text-caption text-muted-foreground",
                        current && "text-primary dark:text-info-strong",
                      )}
                    />
                  </a>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
        <label id="jump-to-label" htmlFor="jump-to-trigger" className="text-body-sm whitespace-nowrap text-muted-foreground">
          {SHELL_COPY.jumpTo}
        </label>
        <Select
          value={activeId}
          onValueChange={(value) => {
            if (!isSectionId(value)) return
            pendingJump.current = value
            setActiveId(value)
          }}
        >
          <SelectTrigger
            id="jump-to-trigger"
            aria-labelledby="jump-to-label"
            className="min-w-0 flex-1 rounded-md border-control-border bg-card text-body data-[size=default]:h-11"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            onCloseAutoFocus={(e) => {
              // The listbox would return focus to the trigger; a choice moves it
              // to the Section h2 instead.
              const id = pendingJump.current
              if (!id) return
              pendingJump.current = null
              e.preventDefault()
              activate(id)
            }}
          >
            {SECTIONS.map((s) => (
              <SelectItem key={s.id} value={s.id} className="min-h-11 text-body">
                <span aria-hidden="true" className="font-mono text-caption text-muted-foreground">
                  {s.number}
                </span>
                <span>{s.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
