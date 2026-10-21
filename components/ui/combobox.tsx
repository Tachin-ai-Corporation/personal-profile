"use client"

import * as React from "react"
import { AlertCircle, Check, Loader2, Search, X } from "lucide-react"

import { FormField, type FieldControlProps, type FormFieldProps } from "@/components/ui/form-field"
import { tabbables } from "@/components/ui/focus"
import { LinkTextButton } from "@/components/ui/link-text-button"
import { INPUT_STYLES } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { COMBOBOX_MESSAGES, CONTROL_MESSAGES, formatMessage } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

import { useCombobox, type ComboboxEntry, type UseComboboxOptions } from "./use-combobox"

export type { ComboboxEntry, ComboboxLoader, ComboboxLoadResult, ComboboxMode, ComboboxSelection, UseComboboxOptions } from "./use-combobox"
export { useCombobox } from "./use-combobox"

/** What `renderOption` gets besides the item. */
export interface ComboboxOptionState {
  /** The keyboard-active option (`aria-activedescendant`). */
  readonly active: boolean
  /** The option is the field's current pick. */
  readonly selected: boolean
  /** The trimmed typed text (e.g. for `HighlightMatch`). */
  readonly query: string
}

export interface ComboboxProps<T> extends UseComboboxOptions<T>, Pick<FormFieldProps, "help" | "error" | "optional" | "required" | "id" | "labelAddon" | "className"> {
  /** The field label; also names the listbox and the clear button ("Clear {label}"). */
  readonly label: string
  readonly placeholder?: string
  readonly maxLength?: number
  readonly name?: string
  /** The input itself is disabled (not the same as `searchDisabled`). */
  readonly disabled?: boolean
  /** A leading search icon in the input (NPI, insurer). */
  readonly searchIcon?: boolean
  /** Option rows: 44 px one line (default) or the 52 px two-line `combobox-option`. */
  readonly optionLayout?: "one-line" | "two-line"
  /** An option's visible content; its accessible name is always `getLabel(item)`. Defaults to the label. */
  readonly renderOption?: (item: T, state: ComboboxOptionState) => React.ReactNode
  /** Default rendering shows the typed text inside each label in weight 600 (address suggestions). */
  readonly highlightMatch?: boolean
  readonly onBlur?: () => void
  /**
   * A ref to the text input (F6-2), e.g. `useSectionForm`'s `field(name).ref`,
   * so the form can focus the field (first invalid field, mapped errors).
   */
  readonly inputRef?: React.Ref<HTMLInputElement>
  /**
   * The wiring of a field whose label, help and error something else renders
   * (e.g. a `KeyValueEditTable` row's `render(control)`). When set, the
   * combobox renders only its input and popup with this wiring, and its own
   * `help`, `error`, `optional`, `required`, `id`, `labelAddon` and
   * `className` are ignored; `label` still names the listbox and the clear button.
   */
  readonly control?: FieldControlProps
}

/** The combobox's `FormField`, or none when the caller supplies the field wiring (`control`). */
function ComboboxField({ control, children, ...field }: FormFieldProps & { readonly control: FieldControlProps | undefined }): React.JSX.Element {
  if (control) return <>{children(control)}</>
  return <FormField {...field}>{children}</FormField>
}

/** Sets a callback or object ref. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value)
  else if (ref) (ref as React.RefObject<T | null>).current = value
}

/** The label with every case-insensitive occurrence of `query` in weight 600. */
export function HighlightMatch({ text, query }: { readonly text: string; readonly query: string }): React.JSX.Element {
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  // Lowercasing that changes the length (e.g. "İ") would shift the slices: show plain text.
  if (query === "" || lower.length !== text.length || needle.length !== query.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let from = 0
  let at = lower.indexOf(needle)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <span key={at} className="font-semibold">
        {text.slice(at, at + needle.length)}
      </span>,
    )
    from = at + needle.length
    at = lower.indexOf(needle, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

/** DESIGN.md `combobox-option` content: line 1 in `cell-strong`, line 2 a muted caption. */
export function ComboboxOptionText({ line1, line2 }: { readonly line1: React.ReactNode; readonly line2?: React.ReactNode }): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-body-sm text-foreground truncate font-medium">{line1}</span>
      {line2 ? <span className="text-caption text-muted-foreground truncate">{line2}</span> : null}
    </span>
  )
}

const ROW = "flex w-full items-center gap-2 rounded-sm px-3 text-body-sm"

/**
 * The F5-2 async combobox (WAI-ARIA 1.2 combobox with a listbox popup) on
 * `useCombobox` and the F5-1 Popover, inside a `FormField` (label, help,
 * error). Focus never leaves the input while the list is used:
 * `aria-activedescendant` names the active option, and pointer presses on the
 * list keep focus in the input. The listbox holds only options (the zero and
 * end rows are `aria-disabled` options); the loading and error rows sit under
 * it, outside the listbox. Since the popup is portaled, Tab is bridged while
 * the error row shows: Tab from the input reaches "Try again.", Tab from
 * there goes on to the element after the field, Shift+Tab returns to the input.
 * Infinite scroll loads the next page when the last option scrolls into view.
 */
export function Combobox<T>(props: ComboboxProps<T>): React.JSX.Element {
  const {
    label,
    help,
    error,
    optional,
    required,
    id,
    labelAddon,
    className,
    placeholder,
    maxLength,
    name,
    disabled = false,
    searchIcon = false,
    optionLayout = "one-line",
    renderOption,
    highlightMatch = false,
    onBlur,
    inputRef: externalInputRef,
    control: externalControl,
  } = props
  // A disabled input searches nothing either (pending work is cancelled, the popup closes).
  const combobox = useCombobox({ ...props, searchDisabled: props.searchDisabled === true || disabled })
  const { entries, statusRow, activeIndex, expanded, selection } = combobox
  const selectedKey = selection?.type === "option" ? props.getKey(selection.item) : selection?.type === "add" ? `add:${selection.text.toLowerCase()}` : null
  type Composition = { readonly origin: string; readonly key: string | null; readonly text: string }
  const [composition, setComposition] = React.useState<Composition | null>(null)
  const activeComposition = composition?.origin === combobox.text && composition.key === selectedKey ? composition : null
  if (composition && !activeComposition) setComposition(null)
  const longComposition = React.useRef<Composition | null>(null)
  const retiredComposition = React.useRef(false)
  React.useLayoutEffect(() => {
    if (longComposition.current && !activeComposition) retiredComposition.current = true
    longComposition.current = activeComposition
  }, [activeComposition])

  // A full picked label is display text, not a query. Replace it on the first
  // deliberate edit so native maxlength can admit the user's new input.
  const prepareLongSelectionEdit = (input: HTMLInputElement): boolean => {
    if (longComposition.current || selection === null || maxLength === undefined || input.value.length < maxLength) return false
    input.select()
    return true
  }

  const listboxId = `${React.useId()}-listbox`
  const optionId = (index: number): string => `${listboxId}-option-${index}`
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // React's before-input prop is synthesized from other events. Observe the
  // actual native event as well (mobile replacements and deletion have no key).
  React.useLayoutEffect(() => {
    const input = inputRef.current!
    const prepare = (event: InputEvent): void => {
      if (!event.isComposing && /^(insert|delete)/.test(event.inputType)) prepareLongSelectionEdit(input)
    }
    input.addEventListener("beforeinput", prepare)
    return () => input.removeEventListener("beforeinput", prepare)
  })
  const setInputRef = React.useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element
      assignRef(externalInputRef, element)
    },
    [externalInputRef],
  )
  const contentRef = React.useRef<HTMLDivElement>(null)
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const retryRef = React.useRef<HTMLButtonElement>(null)
  const lastOptionRef = React.useRef<HTMLDivElement | null>(null)

  const activeOptionId = activeIndex >= 0 ? optionId(activeIndex) : null

  // Keep the active option visible while arrowing through the list.
  React.useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" })
  }, [activeOptionId])

  // Infinite scroll: the last option scrolling into view loads the next page.
  const { canLoadMore, loadMore } = combobox
  const loadMoreRef = React.useRef(loadMore)
  React.useEffect(() => {
    loadMoreRef.current = loadMore
  })
  const lastKey = entries.at(-1)?.key
  React.useEffect(() => {
    const target = lastOptionRef.current
    if (!expanded || !canLoadMore || !target || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) loadMoreRef.current()
      },
      { root: scrollerRef.current },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [expanded, canLoadMore, lastKey])

  /** Focus left the input, its clear button and the popup: close (select-only drops an unpicked query). */
  const handleFocusOut = (event: React.FocusEvent): void => {
    const next = event.relatedTarget
    if (next instanceof Node && (wrapperRef.current?.contains(next) || contentRef.current?.contains(next))) return
    // The window or tab lost focus (no new target): not a real move, so nothing is dropped.
    if (next === null && (!document.hasFocus() || document.visibilityState === "hidden")) return
    combobox.leave()
    onBlur?.()
  }

  /** The first keyboard-reachable element after the field (input and clear button), outside the popup. */
  const focusAfterField = (): boolean => {
    const wrapper = wrapperRef.current
    const content = contentRef.current
    // Inside a modal, stay in it (its focus trap would otherwise pull focus back).
    const scope = wrapper?.closest<HTMLElement>("[role='dialog'], [role='alertdialog'], dialog") ?? document.body
    const next = tabbables(scope).find(
      (el) =>
        !content?.contains(el) &&
        !wrapper?.contains(el) &&
        Boolean(wrapper && wrapper.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    )
    if (!next) return false
    next.focus()
    return true
  }

  const retry = (): void => {
    // The button unmounts once the retry starts; focus goes back to the input first.
    inputRef.current?.focus()
    combobox.retry()
  }

  const rowHeight = optionLayout === "two-line" ? "min-h-[52px] py-1.5" : "min-h-11 py-2"

  return (
    <ComboboxField
      control={externalControl}
      label={label}
      help={help}
      error={error}
      optional={optional}
      required={required}
      id={id}
      labelAddon={labelAddon}
      className={className}
    >
      {(control) => (
        <Popover open={expanded} onOpenChange={(open) => (open ? undefined : combobox.close())}>
          <PopoverAnchor asChild>
            <div ref={wrapperRef} data-slot="combobox" className="relative" onBlur={handleFocusOut}>
              {searchIcon ? (
                <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              ) : null}
              <input
                {...control}
                ref={setInputRef}
                type="text"
                role="combobox"
                name={name}
                value={activeComposition?.text ?? combobox.text}
                placeholder={placeholder}
                maxLength={maxLength}
                disabled={disabled}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listboxId}
                aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                data-slot="combobox-input"
                className={cn(
                  INPUT_STYLES,
                  searchIcon && "pl-9 aria-invalid:pl-[35px]",
                  combobox.text !== "" && !disabled && "pr-11 aria-invalid:pr-[43px]",
                )}
                onChange={(event) => {
                  if (retiredComposition.current) event.target.value = combobox.text
                  else if (longComposition.current) setComposition({ ...longComposition.current, text: event.target.value })
                  else combobox.onInputChange(event.target.value)
                }}
                onBeforeInput={(event) => { prepareLongSelectionEdit(event.currentTarget) }}
                onPaste={(event) => { prepareLongSelectionEdit(event.currentTarget) }}
                onCut={(event) => { prepareLongSelectionEdit(event.currentTarget) }}
                onCompositionStart={(event) => {
                  if (maxLength !== undefined) {
                    prepareLongSelectionEdit(event.currentTarget)
                    combobox.close()
                    retiredComposition.current = false
                    const next = { origin: combobox.text, key: selectedKey, text: event.currentTarget.value }
                    longComposition.current = next
                    setComposition(next)
                  }
                }}
                onCompositionEnd={(event) => {
                  if (retiredComposition.current) {
                    retiredComposition.current = false
                    event.currentTarget.value = combobox.text
                    return
                  }
                  const previous = longComposition.current
                  if (!previous) return
                  longComposition.current = null
                  setComposition(null)
                  if (event.currentTarget.value === previous.origin) return
                  const query = event.currentTarget.value.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, "")
                  event.currentTarget.value = query
                  combobox.onInputChange(query)
                }}
                onFocus={combobox.onInputFocus}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || longComposition.current) return
                  if ((event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) || event.key === "Backspace" || event.key === "Delete") prepareLongSelectionEdit(event.currentTarget)
                  if (combobox.onInputKeyDown(event)) return
                  if (event.key === "Tab" && !event.shiftKey && expanded && statusRow === "error" && retryRef.current) {
                    event.preventDefault()
                    retryRef.current.focus()
                  }
                }}
              />
              {combobox.text !== "" && !disabled ? (
                <button
                  type="button"
                  data-slot="combobox-clear"
                  aria-label={formatMessage(COMBOBOX_MESSAGES.clearLabel, { label })}
                  // Not a tab stop: Tab leaves the field (and a select-only query is dropped); the
                  // keyboard clears by deleting the text. Screen readers and pointers still reach it.
                  tabIndex={-1}
                  className="text-muted-foreground hover:text-foreground focus-ring absolute top-0 right-0 flex size-11 items-center justify-center rounded-md outline-none"
                  onClick={() => {
                    combobox.clear()
                    inputRef.current?.focus()
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <div role="status" aria-live="polite" className="sr-only" data-slot="combobox-status">
                {combobox.announcement}
              </div>
            </div>
          </PopoverAnchor>
          <PopoverContent
            ref={contentRef}
            // A plain container: the listbox inside is the popup (not a dialog).
            role={undefined}
            data-slot="combobox-popup"
            className="w-(--radix-popover-trigger-width) p-0 shadow-md"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              // Radix sees Escape first (document capture). From the input, the input's own handler
              // closes the list and stops the key there; closing here would let it reach the Section.
              event.preventDefault()
              if (!contentRef.current?.contains(document.activeElement)) return
              inputRef.current?.focus()
              combobox.close()
            }}
            onInteractOutside={(event) => {
              // The input and its clear button belong to the combobox.
              if (event.target instanceof Node && wrapperRef.current?.contains(event.target)) event.preventDefault()
            }}
            // Presses on the list keep focus (and the on-screen keyboard) in the input.
            onMouseDown={(event) => event.preventDefault()}
            onBlur={handleFocusOut}
          >
            <div className="flex max-h-(--radix-popover-content-available-height) flex-col p-1">
              {/* The listbox is the scroller (a combobox popup, so axe needs no tab stop on it); the loading and error rows stay under it. */}
              <div
                ref={scrollerRef}
                role="listbox"
                id={listboxId}
                aria-label={label}
                className="max-h-80 min-h-0 overflow-y-auto overscroll-contain"
              >
                {entries.map((entry: ComboboxEntry<T>, index) => {
                  const active = index === activeIndex
                  const picked = entry.key === selectedKey
                  const isLast = index === entries.length - 1
                  return (
                    <div
                      key={entry.key}
                      ref={isLast ? lastOptionRef : undefined}
                      id={optionId(index)}
                      role="option"
                      // The current pick (not the active option, which aria-activedescendant names).
                      aria-selected={picked}
                      aria-label={entry.label}
                      data-active={active ? "true" : undefined}
                      data-slot="combobox-option"
                      className={cn(ROW, rowHeight, "cursor-pointer select-none", active && "bg-accent text-accent-foreground")}
                      onPointerMove={() => {
                        if (!active) combobox.setActiveIndex(index)
                      }}
                      onClick={() => combobox.select(entry)}
                    >
                      <span className="min-w-0 flex-1">
                        {entry.kind === "add"
                          ? entry.label
                          : renderOption
                            ? renderOption(entry.item, { active, selected: picked, query: combobox.trimmedQuery })
                            : highlightMatch
                              ? <HighlightMatch text={entry.label} query={combobox.trimmedQuery} />
                              : entry.label}
                      </span>
                      {picked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                    </div>
                  )
                })}
                {statusRow === "empty" || statusRow === "end" ? (
                  <div
                    role="option"
                    aria-selected={false}
                    aria-disabled="true"
                    id={`${listboxId}-${statusRow}`}
                    data-slot={`combobox-${statusRow}`}
                    className={cn(ROW, "text-muted-foreground min-h-11 py-2")}
                  >
                    {statusRow === "empty" ? combobox.emptyMessage : combobox.endMessage}
                  </div>
                ) : null}
              </div>
              {statusRow === "loading" ? (
                <div data-slot="combobox-loading" className={cn(ROW, "text-muted-foreground min-h-11 py-2")}>
                  <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
                  {COMBOBOX_MESSAGES.searching}
                </div>
              ) : null}
              {statusRow === "error" ? (
                <div data-slot="combobox-error" className={cn(ROW, "text-foreground min-h-11 flex-wrap py-0")}>
                  <AlertCircle aria-hidden="true" className="text-error-strong size-4 shrink-0" />
                  <span>{COMBOBOX_MESSAGES.loadError}</span>
                  <LinkTextButton
                    ref={retryRef}
                    onClick={retry}
                    onKeyDown={(event) => {
                      if (event.key !== "Tab") return
                      if (event.shiftKey) {
                        event.preventDefault()
                        inputRef.current?.focus()
                      } else if (focusAfterField()) event.preventDefault()
                    }}
                  >
                    {CONTROL_MESSAGES.tryAgain}
                  </LinkTextButton>
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </ComboboxField>
  )
}
