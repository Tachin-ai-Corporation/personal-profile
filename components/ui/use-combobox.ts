"use client"

import * as React from "react"

import { COMBOBOX_MESSAGES, formatMessage } from "@/lib/shared/messages"

/**
 * One page of results, or a failed load (shown as the error row, or nothing
 * when `quiet`). `exactMatch: false` says no item on any page matches the
 * query exactly, so `Add "{name}"` may show before every page is loaded.
 */
export type ComboboxLoadResult<T> =
  | { readonly items: readonly T[]; readonly hasMore: boolean; readonly exactMatch?: boolean }
  | { readonly error: true }

/**
 * Loads one page for a (trimmed) query. `signal` aborts when a newer search
 * starts, the list closes or the field unmounts; a rejected promise counts as
 * an error unless it was aborted.
 */
export type ComboboxLoader<T> = (query: string, page: number, signal: AbortSignal) => Promise<ComboboxLoadResult<T>>

/** What the user picked: a listed option, or the `Add "{name}"` option with the typed name. */
export type ComboboxSelection<T> = { readonly type: "option"; readonly item: T } | { readonly type: "add"; readonly text: string }

export type ComboboxMode = "select-only" | "free-text"

/** A selectable row of the listbox. */
export type ComboboxEntry<T> =
  | { readonly kind: "option"; readonly key: string; readonly label: string; readonly item: T }
  | { readonly kind: "add"; readonly key: string; readonly label: string; readonly text: string }

/** The one non-selectable row under the options, if any. */
export type ComboboxStatusRow = "loading" | "error" | "empty" | "end" | null

export interface UseComboboxOptions<T> {
  /** Loads results; omit it for a list of `staticOptions` only. Stories pass their API call here. */
  readonly load?: ComboboxLoader<T>
  readonly getKey: (item: T) => string
  /** The option's full accessible name and the text the input shows once it is picked. */
  readonly getLabel: (item: T) => string
  /** Wait after the last key before searching (default 300 ms). */
  readonly debounceMs?: number
  /** Shortest trimmed query that searches (default 0: an empty query loads the first page). */
  readonly minChars?: number
  /** Expected page size: a shorter page also ends the list, whatever `hasMore` says. */
  readonly pageSize?: number
  /** Keep at most this many results and never page (address suggestions: 5). */
  readonly maxResults?: number
  /** Focusing an empty field opens the listbox and loads the first page at once. */
  readonly openOnFocus?: boolean
  /** `select-only`: leaving the field without a pick clears the text. `free-text`: typed text is kept. */
  readonly mode: ComboboxMode
  /**
   * Offer a last `Add "{name}"` option when no result matches the trimmed
   * query exactly (case-insensitive); returns that option's label.
   */
  readonly allowAdd?: (query: string) => string
  /** Fixed options (no `load`), filtered by the typed text (all shown while the text equals one of them). */
  readonly staticOptions?: readonly T[]
  /** Suggestions are off (e.g. a country without address lookup): no search, no listbox. */
  readonly searchDisabled?: boolean
  /** No loading or error rows and no announcement of them; a failed load just shows nothing (address). */
  readonly quiet?: boolean
  /** The zero-results row (e.g. "No matching NPI found"); without it zero results show no listbox. */
  readonly emptyMessage?: string
  /** The end-of-list row once every page is loaded (e.g. "No more results"). */
  readonly endMessage?: string
  /** Controlled input text; uncontrolled (from `defaultText`) when omitted. */
  readonly text?: string
  readonly defaultText?: string
  /** Every change of the text: typing, a pick, clear, or the select-only reset on leave. */
  readonly onTextChange?: (text: string) => void
  /**
   * Controlled pick (e.g. the saved NPI or insurer of an edit form); uncontrolled
   * (from `defaultSelection`) when `undefined`. A pick holds only while the text
   * equals its label. Without `text`/`defaultText` the text starts as its label.
   */
  readonly selection?: ComboboxSelection<T> | null
  readonly defaultSelection?: ComboboxSelection<T> | null
  /** A pick, or `null` when typing after a pick drops it. */
  readonly onSelect?: (selection: ComboboxSelection<T> | null) => void
  /** The clear (×) button emptied the field. */
  readonly onClear?: () => void
}

interface Results<T> {
  readonly query: string
  readonly items: readonly T[]
  /** The last page loaded (-1 while the first is loading). */
  readonly page: number
  readonly hasMore: boolean
  readonly exactMatch: boolean | undefined
}

type Status = { readonly kind: "idle" } | { readonly kind: "loading"; readonly page: number } | { readonly kind: "error"; readonly query: string; readonly page: number }

const IDLE: Status = { kind: "idle" }

export interface UseComboboxResult<T> {
  readonly text: string
  readonly selection: ComboboxSelection<T> | null
  /** The listbox popup is shown (`aria-expanded`). */
  readonly expanded: boolean
  readonly entries: readonly ComboboxEntry<T>[]
  readonly statusRow: ComboboxStatusRow
  readonly activeIndex: number
  /** The polite status text ("{N} results", "Searching…", "Cleared", …). */
  readonly announcement: string
  /** More pages can be loaded (infinite scroll). */
  readonly canLoadMore: boolean
  readonly trimmedQuery: string
  readonly emptyMessage: string | undefined
  readonly endMessage: string | undefined
  readonly setActiveIndex: (index: number) => void
  readonly onInputChange: (value: string) => void
  /** Handles the listbox keys; returns true when it consumed the key. */
  readonly onInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => boolean
  readonly onInputFocus: () => void
  readonly openList: () => boolean
  readonly close: () => void
  /** Focus left the field (Tab, click elsewhere): closes, and select-only drops a query the user typed without picking. */
  readonly leave: () => void
  readonly select: (entry: ComboboxEntry<T>) => void
  readonly clear: () => void
  /** Repeats the failed request: same query, same page. */
  readonly retry: () => void
  readonly loadMore: () => void
}

/** Case-insensitive "contains" for static options. */
const includesText = (label: string, query: string): boolean => label.toLowerCase().includes(query.toLowerCase())

/**
 * The headless ARIA 1.2 combobox model (F5-2): debounced, abortable paged
 * search with stale-response discard, active option, selection, free text or
 * select-only, `Add "{name}"`, static options and polite announcements.
 * `Combobox` (`combobox.tsx`) is its view; nothing is cached across mounts.
 */
export function useCombobox<T>(options: UseComboboxOptions<T>): UseComboboxResult<T> {
  const {
    load,
    getKey,
    getLabel,
    debounceMs = 300,
    minChars = 0,
    pageSize,
    maxResults,
    openOnFocus = false,
    mode,
    allowAdd,
    staticOptions,
    searchDisabled = false,
    quiet = false,
    emptyMessage,
    endMessage,
    onTextChange,
    onSelect,
    onClear,
  } = options

  const labelOf = (picked: ComboboxSelection<T>): string => (picked.type === "option" ? getLabel(picked.item) : picked.text)

  const [ownText, setOwnText] = React.useState(() => options.defaultText ?? (options.defaultSelection ? labelOf(options.defaultSelection) : ""))
  const text = options.text ?? ownText
  const [ownSelection, setOwnSelection] = React.useState<ComboboxSelection<T> | null>(options.defaultSelection ?? null)
  const rawSelection = options.selection !== undefined ? options.selection : ownSelection
  // A pick holds only while the input shows its label: a parent that resets the text (Discard) drops it.
  const selection = rawSelection && labelOf(rawSelection) === text ? rawSelection : null
  /** The text the user last typed; a text set any other way (pick, clear, parent) isn't "typed". */
  const [typedText, setTypedText] = React.useState<string | null>(null)
  const typed = typedText !== null && typedText === text
  const [open, setOpen] = React.useState(false)
  const [results, setResultsState] = React.useState<Results<T> | null>(null)
  const [status, setStatus] = React.useState<Status>(IDLE)
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const [announcement, setAnnouncement] = React.useState("")

  const resultsRef = React.useRef<Results<T> | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const controllerRef = React.useRef<AbortController | null>(null)
  const requestRef = React.useRef(0)
  const loadRef = React.useRef(load)
  React.useEffect(() => {
    loadRef.current = load
  }, [load])

  const setResults = (next: Results<T> | null): void => {
    resultsRef.current = next
    setResultsState(next)
  }

  /** Cancels the pending debounce and the in-flight request; its response, if any, is ignored. */
  const cancel = React.useCallback((): void => {
    clearTimeout(timerRef.current)
    controllerRef.current?.abort()
    controllerRef.current = null
    requestRef.current += 1
  }, [])

  // Unmount: no debounce fires and the in-flight request is aborted.
  React.useEffect(() => cancel, [cancel])

  // Suggestions turned off (or the input disabled): nothing shown (reset while rendering) and
  // nothing pending (the debounce and the in-flight request are cancelled after the render).
  const [wasSearchDisabled, setWasSearchDisabled] = React.useState(searchDisabled)
  if (wasSearchDisabled !== searchDisabled) {
    setWasSearchDisabled(searchDisabled)
    if (searchDisabled) {
      setResultsState(null)
      setStatus(IDLE)
      setOpen(false)
      setActiveIndex(-1)
      setAnnouncement("")
    }
  }
  React.useEffect(() => {
    if (!searchDisabled) return
    cancel()
    resultsRef.current = null
  }, [searchDisabled, cancel])

  const setText = (next: string): void => {
    if (options.text === undefined) setOwnText(next)
    onTextChange?.(next)
  }

  const setSelection = (next: ComboboxSelection<T> | null): void => {
    if (options.selection === undefined) setOwnSelection(next)
  }

  /** Sets the polite status; the same text twice in a row gets a trailing no-break space so it is announced again. */
  const announce = (message: string): void => {
    setAnnouncement((previous) => (message !== "" && previous === message ? `${message} ` : message))
  }

  /** Announces a result count, or nothing when no listbox will show for it. */
  const announceCount = (count: number, query: string, addPossible: boolean): void => {
    if (count > 0) announce(count === 1 ? COMBOBOX_MESSAGES.resultCountOne : formatMessage(COMBOBOX_MESSAGES.resultCount, { N: count }))
    else if (emptyMessage) announce(emptyMessage)
    else if (allowAdd && query !== "" && addPossible) announce(formatMessage(COMBOBOX_MESSAGES.resultCount, { N: 0 }))
    else announce("")
  }

  const fetchPage = async (query: string, page: number): Promise<void> => {
    const loader = loadRef.current
    if (!loader) return
    cancel()
    const controller = new AbortController()
    controllerRef.current = controller
    const request = requestRef.current
    setStatus({ kind: "loading", page })
    if (page === 0) {
      setResults({ query, items: [], page: -1, hasMore: false, exactMatch: undefined })
      setActiveIndex(-1)
    }
    if (!quiet) announce(COMBOBOX_MESSAGES.searching)

    let result: ComboboxLoadResult<T>
    try {
      result = await loader(query, page, controller.signal)
    } catch {
      result = { error: true }
    }
    // A newer search, a close or an unmount superseded this request.
    if (request !== requestRef.current || controller.signal.aborted) return
    controllerRef.current = null

    if ("error" in result) {
      if (quiet) {
        setStatus(IDLE)
        setResults(null)
        announce("")
        return
      }
      setStatus({ kind: "error", query, page })
      announce(COMBOBOX_MESSAGES.loadError)
      return
    }

    const previous = page === 0 ? [] : (resultsRef.current?.items ?? [])
    const seen = new Set(previous.map(getKey))
    const fresh = result.items.filter((item) => {
      const key = getKey(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    let items = [...previous, ...fresh]
    // An empty (or all-duplicate) page or a short page ends the list, whatever `hasMore` says.
    let hasMore = result.hasMore && fresh.length > 0 && (pageSize === undefined || result.items.length >= pageSize)
    if (maxResults !== undefined) {
      items = items.slice(0, maxResults)
      hasMore = false
    }
    setResults({ query, items, page, hasMore, exactMatch: result.exactMatch })
    setStatus(IDLE)
    announceCount(items.length, query, !hasMore || result.exactMatch === false)
  }

  const trimmedQuery = text.trim()
  const canSearch = load !== undefined && !searchDisabled

  /** Static options for a query: all while it equals one of them, else those containing it. */
  const staticItemsFor = (query: string): readonly T[] => {
    if (!staticOptions) return []
    const lower = query.toLowerCase()
    return staticOptions.some((item) => getLabel(item).toLowerCase() === lower) ? staticOptions : staticOptions.filter((item) => includesText(getLabel(item), query))
  }

  /** Opens the listbox; loads the first page at once when nothing is loaded for the current query (returns true then). */
  const openList = (): boolean => {
    if (searchDisabled) return false
    setOpen(true)
    if (!canSearch || status.kind === "loading" || trimmedQuery.length < minChars) return false
    if (resultsRef.current?.query === trimmedQuery) return false
    clearTimeout(timerRef.current)
    void fetchPage(trimmedQuery, 0)
    return true
  }

  const close = (): void => {
    setOpen(false)
    setActiveIndex(-1)
    announce("")
    if (status.kind === "loading") {
      cancel()
      setStatus(IDLE)
      // A partly loaded list is reloaded on the next open.
      setResults(null)
    } else {
      clearTimeout(timerRef.current)
      if (status.kind === "error") {
        // The error clears; a failed first page reloads on the next open, a later page keeps
        // the loaded options and is requested again when the last option is reached.
        setStatus(IDLE)
        if (status.page === 0) setResults(null)
      }
    }
  }

  const onInputChange = (value: string): void => {
    setText(value)
    setTypedText(value)
    if (selection) {
      setSelection(null)
      onSelect?.(null)
    }
    setActiveIndex(-1)
    if (searchDisabled) return
    setOpen(true)
    const query = value.trim()
    if (!canSearch) {
      if (load === undefined && staticOptions) announceCount(staticItemsFor(query).length, query, true)
      return
    }
    cancel()
    if (status.kind !== "idle") setStatus(IDLE)
    if (query.length < minChars) {
      setResults(null)
      return
    }
    timerRef.current = setTimeout(() => void fetchPage(query, 0), debounceMs)
  }

  // The selectable rows: results (or filtered static options) plus the Add option.
  const entries: ComboboxEntry<T>[] = []
  const items: readonly T[] = canSearch ? (results?.query === trimmedQuery ? results.items : []) : load === undefined && !searchDisabled ? staticItemsFor(trimmedQuery) : []
  for (const item of items) entries.push({ kind: "option", key: getKey(item), label: getLabel(item), item })
  const resultsSettled = canSearch ? status.kind === "idle" && results?.query === trimmedQuery : true
  // While more pages exist an exact match may be on one not loaded yet, unless the loader says there is none.
  const addPossible = canSearch ? results !== null && (!results.hasMore || results.exactMatch === false) : true
  if (allowAdd && trimmedQuery !== "" && resultsSettled && addPossible) {
    const lower = trimmedQuery.toLowerCase()
    if (!entries.some((entry) => entry.label.toLowerCase() === lower)) {
      entries.push({ kind: "add", key: `add:${lower}`, label: allowAdd(trimmedQuery), text: trimmedQuery })
    }
  }

  let statusRow: ComboboxStatusRow = null
  if (status.kind === "loading" && !quiet) statusRow = "loading"
  else if (status.kind === "error") statusRow = "error"
  else if (canSearch && resultsSettled && results && results.page >= 0) {
    if (entries.length === 0 && emptyMessage) statusRow = "empty"
    else if (results.items.length > 0 && !results.hasMore && endMessage) statusRow = "end"
  }

  const expanded = open && !searchDisabled && (entries.length > 0 || statusRow !== null)
  // Only the current query's list pages: during a debounce the loaded list belongs to an older query.
  const canLoadMore = canSearch && status.kind === "idle" && results !== null && results.hasMore && results.query === trimmedQuery

  const loadMore = (): void => {
    if (canLoadMore && results) void fetchPage(results.query, results.page + 1)
  }

  const retry = (): void => {
    if (status.kind === "error") void fetchPage(status.query, status.page)
  }

  const moveTo = (index: number): void => {
    setActiveIndex(index)
    // Reaching the last option by keyboard pages too (the scroll observer does it for pointers).
    if (index === entries.length - 1) loadMore()
  }

  const select = (entry: ComboboxEntry<T>): void => {
    const picked: ComboboxSelection<T> = entry.kind === "option" ? { type: "option", item: entry.item } : { type: "add", text: entry.text }
    cancel()
    setStatus(IDLE)
    setSelection(picked)
    setTypedText(null)
    setText(labelOf(picked))
    setOpen(false)
    setActiveIndex(-1)
    announce("")
    onSelect?.(picked)
  }

  const clear = (): void => {
    cancel()
    setStatus(IDLE)
    setResults(null)
    setSelection(null)
    setTypedText(null)
    setText("")
    setOpen(false)
    setActiveIndex(-1)
    announce(COMBOBOX_MESSAGES.cleared)
    onClear?.()
  }

  const leave = (): void => {
    close()
    // Only a query the user typed without picking is dropped; a saved or picked value stays.
    if (mode === "select-only" && selection === null && typed && text !== "") {
      setText("")
      setTypedText(null)
      setResults(null)
    }
  }

  const onInputFocus = (): void => {
    // Only an empty field opens on focus; focus coming back from the popup (e.g. "Try again.") leaves an open list as it is.
    if (openOnFocus && text === "" && !expanded) openList()
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): boolean => {
    const last = entries.length - 1
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        if (!expanded) {
          if (!openList() && entries.length > 0) moveTo(0)
        } else if (last >= 0) moveTo(Math.min(activeIndex + 1, last))
        return true
      case "ArrowUp":
        event.preventDefault()
        if (!expanded) openList()
        else if (last >= 0) moveTo(activeIndex === -1 ? last : Math.max(activeIndex - 1, 0))
        return true
      case "Home":
      case "End":
        // With no active option they move the caret, as in any text field.
        if (!expanded || activeIndex < 0) return false
        event.preventDefault()
        moveTo(event.key === "Home" ? 0 : last)
        return true
      case "Enter":
        if (!expanded) return false
        event.preventDefault()
        if (activeIndex >= 0 && activeIndex <= last) select(entries[activeIndex])
        return true
      case "Escape":
        if (!expanded) return false
        // Only the listbox closes: the Section (or dialog) around the field never sees this Escape.
        event.preventDefault()
        event.stopPropagation()
        close()
        return true
      default:
        return false
    }
  }

  return {
    text,
    selection,
    expanded,
    entries,
    statusRow,
    activeIndex: activeIndex <= entries.length - 1 ? activeIndex : -1,
    announcement,
    canLoadMore,
    trimmedQuery,
    emptyMessage,
    endMessage,
    setActiveIndex,
    onInputChange,
    onInputKeyDown,
    onInputFocus,
    openList,
    close,
    leave,
    select,
    clear,
    retry,
    loadMore,
  }
}
