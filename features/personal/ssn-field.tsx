"use client"

import { AlertCircle, Eye, EyeOff } from "lucide-react"
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { Button } from "@/components/ui/button"
import type { FieldControlProps } from "@/components/ui/form-field"
import { INPUT_STYLES } from "@/components/ui/input"
import { LiveStatus, useAnnounce } from "@/components/ui/live-status"
import { useCountdown } from "@/features/shell"
import { revealSsn, sessionEvents } from "@/lib/api"
import { caretAfterDigits, digitsBefore } from "@/lib/shared/dates"
import { formatMessage, PERSON_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { formatSsnInput, insertedText, maskDigits, replaceMask, SSN_DIGITS, type MaskSelection } from "./ssn"

/**
 * SSN entry and Reveal (Story 2.3, FR13, NG-9022): the Personal information
 * SSN row in the read view (`SsnValue`) and the edit view (`SsnInput`).
 *
 * The full SSN lives only in this component's React state, and only while it
 * is revealed: `revealSsn()` bypasses SWR, the value is never put in a ref, a
 * context, an attribute, the form or a log, and it is cleared at once after
 * 30 s, on Hide, window blur, a hidden page, `pagehide`, `session-expired` or
 * unmount (the Section's save or cancel unmounts the edit view).
 */

/** How long a revealed SSN stays on screen. */
export const SSN_REVEAL_SECONDS = 30

/** The edit input's `name`: no "ssn" or "social", so password managers and autofill leave it alone. */
export const SSN_INPUT_NAME = "pp-ref-number"

/** The edit input's control id (the row's `controlId`), again without "ssn" or "social". */
export const SSN_CONTROL_ID = "personal-ref-number"

/** The 16 px countdown ring's radius and circumference. */
const RING_RADIUS = 6.5
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

interface SsnReveal {
  /** The full SSN (`XXX-XX-XXXX`) while revealed, else `null`. */
  readonly revealed: string | null
  readonly failed: boolean
  readonly remaining: number
  readonly announcement: string
  readonly reveal: () => void
  /** Hides it (focus on Hide moves to Reveal). */
  readonly hide: () => void
  /**
   * The first edit: a revealed value becomes a new entry (no auto-hide, no
   * focus move), a Reveal in flight is dropped and a failure line cleared.
   */
  readonly drop: () => void
}

/** The Reveal and Hide buttons, for the focus moves. */
interface RevealButtonRefs {
  readonly revealRef: RefObject<HTMLButtonElement | null>
  readonly hideRef: RefObject<HTMLButtonElement | null>
}

/** The Reveal state machine shared by both views. */
function useSsnReveal({ revealRef, hideRef }: RevealButtonRefs): SsnReveal {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  /** A Reveal is in flight (the hide triggers already listen, so a late answer is dropped). */
  const [requesting, setRequesting] = useState(false)
  const { message, announce, clear } = useAnnounce()
  /** The in-flight Reveal; a hide trigger or unmount drops it, so a late answer is never shown. */
  const pending = useRef<object | null>(null)
  const focusNext = useRef<"hide" | "reveal" | null>(null)
  const countdown = useCountdown({ onDone: () => hide() })

  function drop(): void {
    pending.current = null
    setRequesting(false)
    setFailed(false)
    countdown.stop()
    setRevealed(null)
    clear()
  }

  function hide(): void {
    if (hideRef.current !== null && document.activeElement === hideRef.current) focusNext.current = "reveal"
    drop()
  }

  async function reveal(): Promise<void> {
    // After `session-expired` (published once per page) nothing could hide it: never reveal.
    if (pending.current !== null || sessionEvents.hasPublished("session-expired")) return
    const request = {}
    pending.current = request
    setFailed(false)
    setRequesting(true)
    const result = await revealSsn()
    if (pending.current !== request) return
    pending.current = null
    setRequesting(false)
    if (result.ok) {
      if (sessionEvents.hasPublished("session-expired")) return
      // Focus follows only if the user left it on Reveal (or nowhere); else it stays where they put it.
      const active = document.activeElement
      if (active === null || active === document.body || active === revealRef.current) focusNext.current = "hide"
      setRevealed(result.ssn)
      countdown.start(SSN_REVEAL_SECONDS)
      announce(PERSON_MESSAGES.ssnShown)
    } else if (result.mapped?.kind !== "session") {
      // A session failure shows nothing here: the shell's session dialog handles it.
      setFailed(true)
    }
  }

  // Focus moves after the swap: to Hide once shown, back to Reveal when Hide had focus.
  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    ;(target === "hide" ? hideRef : revealRef).current?.focus()
  })

  const onHideTrigger = useEffectEvent(() => hide())
  const watching = revealed !== null || requesting
  // Auto-hide while revealed (or about to be): the window loses focus, the page is hidden or unloaded, or the session ends.
  useEffect(() => {
    if (!watching) return
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") onHideTrigger()
    }
    const onEvent = (): void => onHideTrigger()
    window.addEventListener("blur", onEvent)
    window.addEventListener("pagehide", onEvent)
    document.addEventListener("visibilitychange", onVisibility)
    const unsubscribe = sessionEvents.subscribe("session-expired", onEvent)
    return () => {
      window.removeEventListener("blur", onEvent)
      window.removeEventListener("pagehide", onEvent)
      document.removeEventListener("visibilitychange", onVisibility)
      unsubscribe()
    }
  }, [watching])

  // Unmount (save, cancel, a page move) drops a Reveal still in flight.
  useEffect(
    () => () => {
      pending.current = null
    },
    [],
  )

  return {
    revealed,
    failed,
    remaining: countdown.remaining,
    announcement: message,
    reveal: () => void reveal(),
    hide,
    drop,
  }
}

/** The 16 px countdown ring (border track, primary progress, emptying clockwise); replaced by text under reduced motion. */
function CountdownRing({ remaining }: { readonly remaining: number }) {
  const left = Math.min(1, Math.max(0, remaining / SSN_REVEAL_SECONDS))
  return (
    <>
      <svg
        aria-hidden="true"
        data-slot="ssn-countdown-ring"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="size-4 shrink-0 -rotate-90 motion-reduce:hidden"
      >
        <circle cx="8" cy="8" r={RING_RADIUS} fill="none" strokeWidth="2" className="stroke-border" />
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="2"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={-RING_LENGTH * (1 - left)}
          className="stroke-primary-text transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span data-slot="ssn-hides-in" className="text-muted-foreground text-body-sm hidden whitespace-nowrap motion-reduce:inline">
        {PERSON_MESSAGES.ssnHidesIn}
      </span>
    </>
  )
}

interface ToolButtonProps {
  readonly buttonRef: RefObject<HTMLButtonElement | null>
  readonly onClick: () => void
}

/** The link-text Reveal / Hide buttons: eye icon, underlined, 44 × 44 px. */
function RevealButton({ buttonRef, onClick }: ToolButtonProps) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="link"
      size="touch"
      data-slot="ssn-reveal"
      className="min-w-11 shrink-0 px-2 underline has-[>svg]:px-2"
      aria-label={PERSON_MESSAGES.ssnRevealName}
      onClick={onClick}
    >
      <Eye aria-hidden="true" />
      {PERSON_MESSAGES.ssnReveal}
    </Button>
  )
}

function HideButton({ buttonRef, onClick }: ToolButtonProps) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="link"
      size="touch"
      data-slot="ssn-hide"
      className="min-w-11 shrink-0 px-2 underline has-[>svg]:px-2"
      aria-label={PERSON_MESSAGES.ssnHideName}
      onClick={onClick}
    >
      <EyeOff aria-hidden="true" />
      {PERSON_MESSAGES.ssnHide}
    </Button>
  )
}

/** The revealed controls: the countdown (ring or text) and Hide. */
function RevealedTools({ remaining, buttonRef, onClick }: ToolButtonProps & { readonly remaining: number }) {
  return (
    <>
      <CountdownRing remaining={remaining} />
      <HideButton buttonRef={buttonRef} onClick={onClick} />
    </>
  )
}

/** The failed-Reveal line (polite, not a field error) and the Reveal announcement. */
function RevealStatus({ failed, announcement }: { readonly failed: boolean; readonly announcement: string }) {
  return (
    <>
      <div aria-live="polite" data-slot="ssn-reveal-status">
        {failed ? (
          <p className="text-error-strong text-body-sm flex items-start gap-1.5 font-medium">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{PERSON_MESSAGES.ssnRevealFailed}</span>
          </p>
        ) : null}
      </div>
      <LiveStatus message={announcement} />
    </>
  )
}

/** The mask in `mono-value`, hidden from screen readers, which hear "SSN ending in {last4}" instead (Q1 a). */
function MaskText({ mask }: { readonly mask: string }): ReactNode {
  const digits = maskDigits(mask)
  if (digits === "") {
    return (
      <span data-slot="masked-ssn" className="mono-value">
        {mask}
      </span>
    )
  }
  return (
    <>
      <span data-slot="masked-ssn" aria-hidden="true" className="mono-value">
        {mask}
      </span>
      <span className="sr-only">{formatMessage(PERSON_MESSAGES.ssnEndingIn, { last4: digits })}</span>
    </>
  )
}

/**
 * The read view's SSN value: the saved mask (`isMaskedSsn`) with Reveal, or
 * while revealed the full SSN in `mono-value` with the countdown and Hide.
 */
export function SsnValue({ mask }: { readonly mask: string }) {
  const revealRef = useRef<HTMLButtonElement | null>(null)
  const hideRef = useRef<HTMLButtonElement | null>(null)
  const { revealed, failed, remaining, announcement, reveal, hide } = useSsnReveal({ revealRef, hideRef })
  return (
    <div data-slot="ssn-value" className="flex min-w-0 flex-col">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2">
        {revealed !== null ? (
          <>
            <span data-slot="ssn-revealed" className="mono-value">
              {revealed}
            </span>
            <RevealedTools remaining={remaining} buttonRef={hideRef} onClick={hide} />
          </>
        ) : (
          <>
            <MaskText mask={mask} />
            <RevealButton buttonRef={revealRef} onClick={reveal} />
          </>
        )}
      </div>
      <RevealStatus failed={failed} announcement={announcement} />
    </div>
  )
}

/** `section.control("socialSecurityNumber")`'s wiring (structural, so the Section form type stays in the Section). */
export interface SsnBinding {
  readonly name: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBlur: () => void
  readonly ref: (element: HTMLElement | null) => void
  readonly readOnly: boolean
}

export interface SsnInputProps {
  /** The row's control wiring (`id` is `SSN_CONTROL_ID`). */
  readonly wiring: FieldControlProps
  readonly binding: SsnBinding
  /** The saved mask (the form baseline), `""` without a saved SSN. */
  readonly savedMask: string
}

const digitCount = (text: string): number => text.replace(/\D/g, "").length

/**
 * The edit view's SSN input (the 15th form field): the form holds the saved
 * mask, `""` or the typed `XXX-XX-XXXX` text, never a revealed value, which
 * only this component shows. Auto-formatted, the caret kept on its digit;
 * typing over the mask replaces it, deleting from it clears the field. Kept
 * out of password managers and autofill. The DOM value is written as a
 * property only (the input is uncontrolled), so no SSN lands in an attribute.
 */
export function SsnInput({ wiring, binding: { ref: bindingRef, ...binding }, savedMask }: SsnInputProps) {
  const revealRef = useRef<HTMLButtonElement | null>(null)
  const hideRef = useRef<HTMLButtonElement | null>(null)
  const { revealed: revealedValue, failed, remaining, announcement, reveal, hide, drop } = useSsnReveal({ revealRef, hideRef })
  // While the Section saves, nothing is revealed (and nothing can be): the value is dropped once saving starts.
  const revealed = binding.readOnly ? null : revealedValue
  const onSaving = useEffectEvent(() => drop())
  useEffect(() => {
    if (binding.readOnly) onSaving()
  }, [binding.readOnly])
  const inputRef = useRef<HTMLInputElement | null>(null)
  /** Where the selection sat in the shown mask on the key, paste, cut or drop that starts an edit (numbers only). */
  const maskSelection = useRef<MaskSelection | null>(null)
  const untouched = savedMask !== "" && binding.value === savedMask
  const canReveal = untouched && !binding.readOnly
  const shown = revealed ?? binding.value
  const helpId = `${wiring.id}-ssn-help`
  const help = revealed !== null ? PERSON_MESSAGES.ssnHelpRevealed : untouched ? PERSON_MESSAGES.ssnHelpMasked : null
  const describedBy = [help === null ? null : helpId, wiring["aria-describedby"]].filter(Boolean).join(" ") || undefined

  useLayoutEffect(() => {
    const input = inputRef.current
    if (input !== null && input.value !== shown) input.value = shown
  }, [shown])

  /** Shows `next` with the caret after `digits` digits and hands it to the form (a revealed value becomes a new entry). */
  function commit(input: HTMLInputElement, next: string, digits: number): void {
    input.value = next
    const caret = caretAfterDigits(next, digits)
    input.setSelectionRange(caret, caret)
    // Always: also drops a Reveal still in flight (its answer must not cover the typed text) and a failure line.
    drop()
    binding.onChange(next)
  }

  /** Puts `shown` back (an edit that changes nothing), the caret where it was. */
  function revert(input: HTMLInputElement, raw: string, caret: number): void {
    input.value = shown
    const back = Math.max(0, Math.min(shown.length, caret - (raw.length - shown.length)))
    input.setSelectionRange(back, back)
  }

  function onChange(input: HTMLInputElement): void {
    const raw = input.value
    const caret = input.selectionStart ?? raw.length
    if (revealed === null && untouched) {
      const next = replaceMask(savedMask, raw, maskSelection.current)
      maskSelection.current = null
      if (next === null) revert(input, raw, caret)
      else commit(input, next, SSN_DIGITS)
      return
    }
    // An insert of nine or more digits (a paste, a drop) is the new number: its first nine digits.
    const inserted = insertedText(shown, raw)
    if (digitCount(inserted) >= SSN_DIGITS) {
      commit(input, formatSsnInput(inserted), SSN_DIGITS)
      return
    }
    // A single tenth digit typed into a full number is ignored.
    if (digitCount(raw) > SSN_DIGITS && digitCount(shown) >= SSN_DIGITS) {
      revert(input, raw, caret)
      return
    }
    const next = formatSsnInput(raw)
    if (next === shown) revert(input, raw, caret)
    else commit(input, next, digitsBefore(raw, caret))
  }

  /** A paste holding nine or more digits replaces the whole value with its first nine; any other paste is an edit. */
  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const input = event.currentTarget
    const text = event.clipboardData?.getData("text") ?? ""
    if (!binding.readOnly && digitCount(text) >= SSN_DIGITS) {
      event.preventDefault()
      commit(input, formatSsnInput(text), SSN_DIGITS)
      return
    }
    recordMaskSelection(input)
  }

  /** Over the mask: remembers the selection the coming edit replaces (`replaceMask`). */
  function recordMaskSelection(input: HTMLInputElement): void {
    if (revealed !== null || !untouched) return
    const start = input.selectionStart
    const end = input.selectionEnd
    maskSelection.current = start === null || end === null ? null : { start, end }
  }

  /** Backspace or Delete next to a hyphen deletes the digit beyond it (the format would put the hyphen back). */
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    recordMaskSelection(event.currentTarget)
    if (binding.readOnly || (revealed === null && untouched)) return
    const input = event.currentTarget
    const caret = input.selectionStart ?? 0
    if (caret !== input.selectionEnd) return
    const text = input.value
    if (event.key === "Backspace" && caret > 1 && text[caret - 1] === "-") {
      event.preventDefault()
      commit(input, formatSsnInput(text.slice(0, caret - 2) + text.slice(caret)), digitsBefore(text, caret) - 1)
    } else if (event.key === "Delete" && text[caret] === "-") {
      event.preventDefault()
      commit(input, formatSsnInput(text.slice(0, caret) + text.slice(caret + 2)), digitsBefore(text, caret))
    }
  }

  return (
    <div data-slot="ssn-input" className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <input
          id={wiring.id}
          aria-describedby={describedBy}
          aria-invalid={wiring["aria-invalid"]}
          aria-required={wiring["aria-required"]}
          ref={(element) => {
            inputRef.current = element
            bindingRef(element)
          }}
          type="text"
          name={SSN_INPUT_NAME}
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          data-slot="input"
          // As 1health-fe (PersonalInformationForm.tsx:442-445); the saved mask, when there is one, fills the input instead.
          placeholder={PERSON_MESSAGES.ssnPlaceholder}
          readOnly={binding.readOnly}
          className={cn(INPUT_STYLES, "min-w-0 flex-1")}
          onChange={(event) => onChange(event.currentTarget)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCut={(event) => recordMaskSelection(event.currentTarget)}
          onDrop={(event) => recordMaskSelection(event.currentTarget)}
          onBlur={binding.onBlur}
        />
        {revealed !== null ? (
          <RevealedTools remaining={remaining} buttonRef={hideRef} onClick={hide} />
        ) : canReveal ? (
          <RevealButton buttonRef={revealRef} onClick={reveal} />
        ) : null}
      </div>
      {help === null ? null : (
        <p id={helpId} data-slot="field-help" className="text-muted-foreground text-body-sm">
          {help}
        </p>
      )}
      <RevealStatus failed={failed} announcement={announcement} />
    </div>
  )
}
