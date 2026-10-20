import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { COMBOBOX_MESSAGES, formatMessage } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { FakeIntersectionObserver, reportIntersections, stubLayoutApis } from "@/test/dom-stubs"
import { FormField } from "./form-field"
import { Combobox, ComboboxOptionText, HighlightMatch, type ComboboxLoadResult, type ComboboxProps, type ComboboxSelection } from "./combobox"

interface Npi {
  readonly npi: string
  readonly name: string
  readonly city: string
}

interface Call {
  readonly query: string
  readonly page: number
  readonly signal: AbortSignal
  resolve(result: ComboboxLoadResult<Npi>): void
  reject(error: unknown): void
}

/** A loader whose every request is resolved by hand. */
function manualLoader() {
  const calls: Call[] = []
  const load = vi.fn(
    (query: string, page: number, signal: AbortSignal) =>
      new Promise<ComboboxLoadResult<Npi>>((resolve, reject) => {
        calls.push({ query, page, signal, resolve, reject })
      }),
  )
  return { load, calls }
}

const npis = (count: number, from = 0): Npi[] =>
  Array.from({ length: count }, (_, i) => ({ npi: String(1000000000 + from + i), name: `Person ${from + i}`, city: "Austin, TX" }))

const npiLabel = (item: Npi): string => `${item.npi}, ${item.name}, ${item.city}`

/** Flushes settled promises and the React updates they cause. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

function renderNpi(overrides: Partial<ComboboxProps<Npi>> = {}) {
  const { load, calls } = manualLoader()
  const onSelect = vi.fn<(selection: ComboboxSelection<Npi> | null) => void>()
  const onClear = vi.fn()
  const onSectionKeyDown = vi.fn()
  render(
    <div onKeyDown={(event) => onSectionKeyDown(event.key)}>
      <Combobox<Npi>
        label="Search for your personal NPI number"
        placeholder={COMBOBOX_MESSAGES.npiPlaceholder}
        load={load}
        getKey={(item) => item.npi}
        getLabel={npiLabel}
        debounceMs={600}
        maxLength={100}
        pageSize={10}
        openOnFocus
        mode="select-only"
        searchIcon
        optionLayout="two-line"
        renderOption={(item) => <ComboboxOptionText line1={`${item.npi} ${item.name}`} line2={item.city} />}
        emptyMessage={COMBOBOX_MESSAGES.npiNoMatches}
        endMessage={COMBOBOX_MESSAGES.noMoreResults}
        onSelect={onSelect}
        onClear={onClear}
        {...overrides}
      />
      <button type="button">After</button>
    </div>,
  )
  const input = screen.getByRole("combobox", { name: "Search for your personal NPI number" })
  return { input, load, calls, onSelect, onClear, onSectionKeyDown }
}

/** A non-option row under the listbox ("loading", "error"). */
const row = (slot: "loading" | "error") => document.querySelector(`[data-slot='combobox-${slot}']`)
const status = () => document.querySelector("[data-slot='combobox-status']")?.textContent
const key = (input: HTMLElement, name: string, init: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(input, { key: name, ...init })

beforeEach(() => {
  stubLayoutApis()
  // jsdom has no layout: give every element a box unless it (or an ancestor) is display: none.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[style*='display: none']") ? [] : [{}]) as unknown as DOMRectList
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Combobox: ARIA 1.2", () => {
  it("wires combobox → listbox, activedescendant and option names, and is axe clean while open", async () => {
    const { input, calls } = renderNpi()
    expect(input.getAttribute("aria-expanded")).toBe("false")
    expect(input.getAttribute("aria-autocomplete")).toBe("list")
    expect(input.getAttribute("maxlength")).toBe("100")
    expect(input.getAttribute("placeholder")).toBe("Search by NPI or name")

    fireEvent.focus(input)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ query: "", page: 0 })
    calls[0].resolve({ items: npis(3), hasMore: false })
    await flush()

    const listbox = screen.getByRole("listbox", { name: "Search for your personal NPI number" })
    expect(input.getAttribute("aria-expanded")).toBe("true")
    expect(input.getAttribute("aria-controls")).toBe(listbox.id)
    const options = screen.getAllByRole("option")
    expect(options.map((option) => option.getAttribute("aria-label") ?? option.textContent)).toEqual([
      "1000000000, Person 0, Austin, TX",
      "1000000001, Person 1, Austin, TX",
      "1000000002, Person 2, Austin, TX",
      "No more results",
    ])
    expect(options[3].getAttribute("aria-disabled")).toBe("true")
    expect(options[0].className).toContain("min-h-[52px]")
    expect(status()).toBe("3 results")

    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id)
    // aria-selected marks the current pick, not the active option (none picked yet).
    expect(options.slice(0, 3).map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "false", "false"])

    // The popup is a plain container (not a dialog) on row-menu tokens.
    const popup = document.querySelector("[data-slot='combobox-popup']")
    expect(popup?.getAttribute("role")).toBeNull()
    for (const name of ["bg-popover", "rounded-md", "shadow-md"]) expect(popup?.className).toContain(name)
    vi.useRealTimers()
    expect(await axeViolations()).toEqual([])
  })

  it("is axe clean with the error row, loading row and zero-results row", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    expect(row("loading")?.textContent).toBe("Searching…")
    expect(status()).toBe("Searching…")
    calls[0].resolve({ error: true })
    await flush()
    expect(row("error")?.textContent).toContain("Couldn't load results.")
    expect(status()).toBe("Couldn't load results.")
    vi.useRealTimers()
    expect(await axeViolations()).toEqual([])
  })
})

describe("Combobox: async search", () => {
  it("debounces typing: one request 600 ms after the last key, earlier ones aborted", async () => {
    const { input, calls, load } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "a" } })
    await advance(300)
    fireEvent.change(input, { target: { value: "ab" } })
    await advance(300)
    fireEvent.change(input, { target: { value: " abc " } })
    await advance(599)
    expect(load).not.toHaveBeenCalled()
    await advance(1)
    expect(load).toHaveBeenCalledTimes(1)
    expect(calls[0]).toMatchObject({ query: "abc", page: 0 })

    // A key while a request is in flight aborts it.
    fireEvent.change(input, { target: { value: "abcd" } })
    expect(calls[0].signal.aborted).toBe(true)
  })

  it("discards a stale response that arrives after a newer query's", async () => {
    const { input, calls } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "ab" } })
    await advance(600)
    fireEvent.change(input, { target: { value: "abc" } })
    await advance(600)
    calls[1].resolve({ items: npis(1, 50), hasMore: false })
    await flush()
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label") ?? option.textContent)).toEqual([
      "1000000050, Person 50, Austin, TX",
      "No more results",
    ])
    expect(status()).toBe("1 result")
  })

  it("pages when the last option scrolls into view, then ends with No more results", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
    FakeIntersectionObserver.instances = []
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    expect(screen.queryByText("No more results")).toBeNull()
    const last = screen.getAllByRole("option").at(-1) as HTMLElement
    reportIntersections({ [last.id]: true })
    expect(calls[1]).toMatchObject({ query: "", page: 1 })
    expect(row("loading")?.textContent).toBe("Searching…")
    // The loaded options stay while the next page loads.
    expect(screen.getAllByRole("option")).toHaveLength(10)
    calls[1].resolve({ items: npis(5, 10), hasMore: false })
    await flush()
    expect(screen.getAllByRole("option")).toHaveLength(16)
    expect(screen.getByText("No more results")).toBeTruthy()
    expect(status()).toBe("15 results")
  })

  it("pages from the keyboard when the last option becomes active; a short page ends the list", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    expect(calls[1]).toMatchObject({ page: 1 })
    // hasMore says true, but fewer than pageSize came back.
    calls[1].resolve({ items: npis(3, 10), hasMore: true })
    await flush()
    expect(screen.getByText("No more results")).toBeTruthy()
    key(input, "End")
    expect(calls).toHaveLength(2)
  })

  it("a failed page keeps the loaded options; Try again repeats the same query and page", async () => {
    const { input, calls } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "lee" } })
    await advance(600)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    calls[1].reject(new Error("network"))
    await flush()
    expect(screen.getAllByRole("option")).toHaveLength(10)
    expect(row("error")?.textContent).toContain("Couldn't load results.")
    fireEvent.click(screen.getByRole("button", { name: "Try again." }))
    expect(calls[2]).toMatchObject({ query: "lee", page: 1 })
    expect(document.activeElement).toBe(input)
    calls[2].resolve({ items: npis(2, 10), hasMore: false })
    await flush()
    expect(screen.getAllByRole("option")).toHaveLength(13)
  })

  it("zero results show the aria-disabled empty row, never selectable, announced", async () => {
    const { input, calls, onSelect } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "zzz" } })
    await advance(600)
    calls[0].resolve({ items: [], hasMore: false })
    await flush()
    const empty = screen.getByRole("option", { name: "No matching NPI found" })
    expect(empty.getAttribute("aria-disabled")).toBe("true")
    expect(status()).toBe("No matching NPI found")
    key(input, "ArrowDown")
    key(input, "Enter")
    fireEvent.click(empty)
    expect(onSelect).not.toHaveBeenCalled()
    expect(input.getAttribute("aria-activedescendant")).toBeNull()
  })

  it("a loader that rejects after an abort is ignored", async () => {
    const { input, calls } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "ab" } })
    await advance(600)
    fireEvent.change(input, { target: { value: "abc" } })
    calls[0].reject(new DOMException("aborted", "AbortError"))
    await flush()
    expect(row("error")).toBeNull()
  })

  it("closing while a search loads cancels it; reopening reloads", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    key(input, "Escape")
    expect(calls[0].signal.aborted).toBe(true)
    expect(input.getAttribute("aria-expanded")).toBe("false")
    key(input, "ArrowDown")
    expect(calls[1]).toMatchObject({ query: "", page: 0 })
  })

  it("does not search below minChars", async () => {
    const { input, load } = renderNpi({ openOnFocus: false, minChars: 2 })
    fireEvent.change(input, { target: { value: "a" } })
    await advance(1000)
    expect(load).not.toHaveBeenCalled()
    key(input, "ArrowDown")
    expect(load).not.toHaveBeenCalled()
  })
})

describe("Combobox: keyboard and selection", () => {
  async function openWith(items: Npi[]) {
    const view = renderNpi()
    fireEvent.focus(view.input)
    view.calls[0].resolve({ items, hasMore: false })
    await flush()
    return view
  }

  it("arrows move (skipping the end row), Home/End jump, Enter selects and shows the full label", async () => {
    const { input, onSelect } = await openWith(npis(3))
    const options = () => screen.getAllByRole("option")
    key(input, "ArrowUp")
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[2].id)
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[2].id)
    key(input, "Home")
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[0].id)
    key(input, "ArrowUp")
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[0].id)
    key(input, "ArrowDown")
    key(input, "Enter")
    expect(onSelect).toHaveBeenCalledWith({ type: "option", item: npis(3)[1] })
    expect((input as HTMLInputElement).value).toBe("1000000001, Person 1, Austin, TX")
    expect(input.getAttribute("aria-expanded")).toBe("false")
  })

  it("Home/End move the caret while no option is active; Enter with none active selects nothing", async () => {
    const { input, onSelect } = await openWith(npis(2))
    expect(fireEvent.keyDown(input, { key: "Home" })).toBe(true)
    expect(fireEvent.keyDown(input, { key: "End" })).toBe(true)
    expect(input.getAttribute("aria-activedescendant")).toBeNull()
    key(input, "Enter")
    expect(onSelect).not.toHaveBeenCalled()
    // Enter on a closed list is left alone.
    key(input, "Escape")
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true)
  })

  it("Escape closes only the listbox: the Section around it never sees it", async () => {
    const { input, onSectionKeyDown } = await openWith(npis(2))
    key(input, "Escape")
    expect(input.getAttribute("aria-expanded")).toBe("false")
    expect(onSectionKeyDown).not.toHaveBeenCalledWith("Escape")
    expect(document.activeElement === input || document.activeElement === document.body).toBe(true)
    // A closed list lets Escape through.
    key(input, "Escape")
    expect(onSectionKeyDown).toHaveBeenCalledWith("Escape")
  })

  it("a click selects; hovering makes an option active", async () => {
    const { input, onSelect } = await openWith(npis(2))
    const second = screen.getAllByRole("option")[1]
    fireEvent.pointerMove(second)
    expect(input.getAttribute("aria-activedescendant")).toBe(second.id)
    fireEvent.pointerMove(second)
    expect(fireEvent.mouseDown(second)).toBe(false)
    fireEvent.click(second)
    expect(onSelect).toHaveBeenCalledWith({ type: "option", item: npis(2)[1] })
  })

  it("typing after a selection clears the selection and searches again", async () => {
    const { input, onSelect, calls } = await openWith(npis(2))
    key(input, "ArrowDown")
    key(input, "Enter")
    fireEvent.change(input, { target: { value: "1000000000, Person 0, Austin, T" } })
    expect(onSelect).toHaveBeenLastCalledWith(null)
    await advance(600)
    expect(calls.at(-1)?.query).toBe("1000000000, Person 0, Austin, T")
  })

  it("select-only: leaving with an unpicked query clears it; a pick is kept", async () => {
    const onTextChange = vi.fn()
    const { input, calls } = renderNpi({ openOnFocus: false, onTextChange })
    const after = screen.getByRole("button", { name: "After" })
    input.focus()
    fireEvent.change(input, { target: { value: "lee" } })
    fireEvent.blur(input, { relatedTarget: after })
    expect((input as HTMLInputElement).value).toBe("")
    expect(onTextChange).toHaveBeenLastCalledWith("")

    fireEvent.change(input, { target: { value: "lee" } })
    await advance(600)
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    key(input, "ArrowDown")
    key(input, "Enter")
    onTextChange.mockClear()
    fireEvent.blur(input, { relatedTarget: after })
    expect((input as HTMLInputElement).value).toBe("1000000000, Person 0, Austin, TX")
    expect(onTextChange).not.toHaveBeenCalled()
  })

  it("the picked option shows a check and focus re-entry does not reopen a picked field", async () => {
    const { input, calls } = await openWith(npis(2))
    key(input, "ArrowDown")
    key(input, "Enter")
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect((input as HTMLInputElement).value).toBe("1000000000, Person 0, Austin, TX")
    fireEvent.focus(input)
    expect(calls).toHaveLength(1)
    // ArrowDown opens it again; the pick is marked.
    key(input, "ArrowDown")
    calls[1].resolve({ items: npis(2), hasMore: false })
    await flush()
    const [picked, other] = screen.getAllByRole("option")
    expect(picked.querySelector("svg")).not.toBeNull()
    // The pick is exposed to assistive tech, separately from the active option.
    expect(picked.getAttribute("aria-selected")).toBe("true")
    expect(other.getAttribute("aria-selected")).toBe("false")
    key(input, "ArrowDown")
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe(other.id)
    expect(picked.getAttribute("aria-selected")).toBe("true")
  })

  it("× clears text and selection, keeps focus, announces Cleared", async () => {
    const { input, onClear } = await openWith(npis(2))
    key(input, "ArrowDown")
    key(input, "Enter")
    const clear = screen.getByRole("button", { name: "Clear Search for your personal NPI number" })
    expect(clear.className).toContain("size-11")
    fireEvent.click(clear)
    expect((input as HTMLInputElement).value).toBe("")
    expect(document.activeElement).toBe(input)
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(status()).toBe("Cleared")
    expect(screen.queryByRole("button", { name: /^Clear/ })).toBeNull()
  })

  it("Tab from the input reaches Try again.; Tab from there leaves the field, Shift+Tab returns", async () => {
    const { input, calls } = renderNpi()
    input.focus()
    calls[0].resolve({ error: true })
    await flush()
    const retry = screen.getByRole("button", { name: "Try again." })
    key(input, "Tab")
    expect(document.activeElement).toBe(retry)
    key(retry, "Tab", { shiftKey: true })
    expect(document.activeElement).toBe(input)
    key(input, "Tab")
    key(retry, "Tab")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After" }))
    // Other keys on the button are left alone.
    expect(fireEvent.keyDown(retry, { key: "a" })).toBe(true)
  })

  it("Escape from Try again. returns focus to the input", async () => {
    const { input, calls } = renderNpi()
    input.focus()
    calls[0].resolve({ error: true })
    await flush()
    const retry = screen.getByRole("button", { name: "Try again." })
    retry.focus()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute("aria-expanded")).toBe("false")
  })

  it("a press on the input does not dismiss the list", async () => {
    const { input } = await openWith(npis(2))
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    fireEvent.pointerDown(input, { button: 0 })
    expect(input.getAttribute("aria-expanded")).toBe("true")
  })
})

describe("Combobox: variants", () => {
  interface Insurer {
    readonly id: number
    readonly name: string
  }

  it("insurer: Add “{name}” when nothing matches exactly; picking it returns the typed name", async () => {
    const calls: { resolve: (r: ComboboxLoadResult<Insurer>) => void }[] = []
    const onSelect = vi.fn()
    render(
      <Combobox<Insurer>
        label="Insurer"
        help={COMBOBOX_MESSAGES.insurerHelp}
        load={() => new Promise((resolve) => calls.push({ resolve }))}
        getKey={(item) => String(item.id)}
        getLabel={(item) => item.name}
        debounceMs={300}
        minChars={2}
        pageSize={20}
        mode="select-only"
        allowAdd={(name) => formatMessage(COMBOBOX_MESSAGES.addOption, { name })}
        onSelect={onSelect}
      />,
    )
    const input = screen.getByRole("combobox", { name: "Insurer" })
    expect(input.getAttribute("aria-describedby")).toBeTruthy()
    expect(screen.getByText("Search the list, or add your insurer by name if it isn't there.")).toBeTruthy()
    fireEvent.change(input, { target: { value: "aetna" } })
    await advance(300)
    calls[0].resolve({ items: [{ id: 1, name: "Aetna" }], hasMore: false })
    await flush()
    // An exact (case-insensitive) match: no Add option.
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual(["Aetna"])
    fireEvent.change(input, { target: { value: "Acme Health " } })
    // While searching, no Add option yet.
    expect(screen.queryByRole("option", { name: /^Add/ })).toBeNull()
    await advance(300)
    calls[1].resolve({ items: [{ id: 2, name: "Acme Health Plus" }], hasMore: false })
    await flush()
    const add = screen.getByRole("option", { name: "Add “Acme Health”" })
    key(input, "ArrowDown")
    key(input, "End")
    expect(input.getAttribute("aria-activedescendant")).toBe(add.id)
    key(input, "Enter")
    expect(onSelect).toHaveBeenCalledWith({ type: "add", text: "Acme Health" })
    expect((input as HTMLInputElement).value).toBe("Acme Health")
  })

  it("address: ≥3 chars, max 5, matched text in 600, free text kept on leave, silent failure, disabled when told", async () => {
    const calls: { query: string; resolve: (r: ComboboxLoadResult<string>) => void }[] = []
    const onTextChange = vi.fn()
    function Address({ searchDisabled }: { searchDisabled: boolean }) {
      return (
        <>
          <Combobox<string>
            label="Address line 1"
            help={COMBOBOX_MESSAGES.addressHelp}
            load={(query) => new Promise((resolve) => calls.push({ query, resolve }))}
            getKey={(item) => item}
            getLabel={(item) => item}
            debounceMs={250}
            minChars={3}
            maxResults={5}
            mode="free-text"
            quiet
            highlightMatch
            searchDisabled={searchDisabled}
            onTextChange={onTextChange}
          />
          <button type="button">After</button>
        </>
      )
    }
    const { rerender } = render(<Address searchDisabled={false} />)
    const input = screen.getByRole("combobox", { name: "Address line 1" })
    fireEvent.change(input, { target: { value: "12" } })
    await advance(250)
    expect(calls).toHaveLength(0)
    fireEvent.change(input, { target: { value: "12 Main" } })
    await advance(249)
    expect(calls).toHaveLength(0)
    await advance(1)
    // Quiet: no loading row, no listbox until suggestions arrive.
    expect(input.getAttribute("aria-expanded")).toBe("false")
    calls[0].resolve({ items: ["12 Main St", "12 Main Ave", "12 Main Rd", "12 Main Ct", "12 Main Ln", "12 Main Way"], hasMore: true })
    await flush()
    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(5)
    expect(options[0].querySelector(".font-semibold")?.textContent).toBe("12 Main")
    expect(status()).toBe("5 results")

    // Failure: no listbox, no error.
    fireEvent.change(input, { target: { value: "12 Main S" } })
    await advance(250)
    calls[1].resolve({ error: true })
    await flush()
    expect(input.getAttribute("aria-expanded")).toBe("false")
    expect(row("error")).toBeNull()

    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect((input as HTMLInputElement).value).toBe("12 Main S")
    expect(onTextChange).toHaveBeenLastCalledWith("12 Main S")

    rerender(<Address searchDisabled />)
    fireEvent.change(input, { target: { value: "12 Main Street" } })
    await advance(500)
    expect(calls).toHaveLength(2)
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-expanded")).toBe("false")
  })

  it("gender identity: static options filter by text, free text is kept", async () => {
    const onSelect = vi.fn()
    function Gender() {
      const [value, setValue] = React.useState("Asked but not answered")
      return (
        <>
          <Combobox<string>
            label="Gender identity"
            help={COMBOBOX_MESSAGES.genderIdentityHelp}
            staticOptions={["Asked but not answered", "Female", "Male", "Other"]}
            getKey={(item) => item}
            getLabel={(item) => item}
            mode="free-text"
            text={value}
            onTextChange={setValue}
            onSelect={onSelect}
          />
          <output data-testid="value">{value}</output>
          <button type="button">After</button>
        </>
      )
    }
    render(<Gender />)
    const input = screen.getByRole("combobox", { name: "Gender identity" })
    expect((input as HTMLInputElement).value).toBe("Asked but not answered")
    key(input, "ArrowDown")
    // The text is one of the options: every option is offered.
    expect(screen.getAllByRole("option")).toHaveLength(4)
    fireEvent.change(input, { target: { value: "ask" } })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Asked but not answered"])
    fireEvent.change(input, { target: { value: "ma" } })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Female", "Male"])
    key(input, "ArrowDown")
    key(input, "ArrowDown")
    key(input, "Enter")
    expect(onSelect).toHaveBeenCalledWith({ type: "option", item: "Male" })
    expect(screen.getByTestId("value").textContent).toBe("Male")
    // A picked value lists every option again.
    key(input, "ArrowDown")
    expect(screen.getAllByRole("option")).toHaveLength(4)
    key(input, "Escape")
    fireEvent.change(input, { target: { value: "Nonbinary" } })
    expect(input.getAttribute("aria-expanded")).toBe("false")
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect(screen.getByTestId("value").textContent).toBe("Nonbinary")
  })

  it("control: renders only the input and popup with the caller's field wiring (one label, the caller's help and error)", async () => {
    vi.useRealTimers()
    render(
      <FormField label="Gender identity" required help={COMBOBOX_MESSAGES.genderIdentityHelp} error="Choose a value">
        {(control) => (
          <Combobox<string>
            control={control}
            label="Gender identity"
            help="Ignored help"
            error="Ignored error"
            optional
            id="ignored-id"
            className="ignored-class"
            staticOptions={["Female", "Male"]}
            getKey={(item) => item}
            getLabel={(item) => item}
            mode="free-text"
            defaultText=""
          />
        )}
      </FormField>,
    )
    const input = screen.getByRole("combobox", { name: "Gender identity" })
    expect(document.querySelectorAll("label")).toHaveLength(1)
    expect(document.querySelectorAll("[data-slot='form-field']")).toHaveLength(1)
    expect(document.querySelector(".ignored-class")).toBeNull()
    expect(screen.queryByText("Ignored help")).toBeNull()
    expect(screen.queryByText("Ignored error")).toBeNull()
    expect(input.id).not.toBe("ignored-id")
    expect(input.getAttribute("aria-describedby")).toBe(`${input.id}-help ${input.id}-error`)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-required")).toBe("true")
    key(input, "ArrowDown")
    expect(screen.getByRole("listbox", { name: "Gender identity" })).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("a disabled input has no clear button", () => {
    render(<Combobox<string> label="Locked" staticOptions={[]} getKey={(i) => i} getLabel={(i) => i} mode="free-text" defaultText="x" disabled />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})

describe("HighlightMatch", () => {
  it("bolds every occurrence, case-insensitively", () => {
    const { container } = render(<HighlightMatch text="Main St and main road" query="MAIN" />)
    expect([...container.querySelectorAll(".font-semibold")].map((el) => el.textContent)).toEqual(["Main", "main"])
    expect(container.textContent).toBe("Main St and main road")
  })

  it("renders plain text when lowercasing changes the length", () => {
    const { container } = render(<HighlightMatch text="İstanbul Ave" query="ist" />)
    expect(container.innerHTML).toBe("İstanbul Ave")
  })

  it("renders plain text for an empty query", () => {
    const { container } = render(<HighlightMatch text="Main" query="" />)
    expect(container.innerHTML).toBe("Main")
  })
})

describe("Combobox: saved values and state sync", () => {
  const saved: ComboboxSelection<Npi> = { type: "option", item: npis(1, 7)[0] }

  it("a seeded pick shows its label, isn't searched on focus and survives focus + Tab", () => {
    const { input, load } = renderNpi({ defaultSelection: saved })
    expect((input as HTMLInputElement).value).toBe("1000000007, Person 7, Austin, TX")
    input.focus()
    fireEvent.focus(input)
    expect(load).not.toHaveBeenCalled()
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect((input as HTMLInputElement).value).toBe("1000000007, Person 7, Austin, TX")
  })

  it("saved text without a pick (select-only) is not dropped on leave; only typed text is", () => {
    const { input } = renderNpi({ defaultText: "Saved Insurer" })
    const after = screen.getByRole("button", { name: "After" })
    fireEvent.focus(input)
    fireEvent.blur(input, { relatedTarget: after })
    expect((input as HTMLInputElement).value).toBe("Saved Insurer")
  })

  it("a controlled pick is marked, and a parent text reset (Discard) drops it", async () => {
    function Controlled() {
      const [text, setText] = React.useState(npiLabel(saved.type === "option" ? saved.item : npis(1)[0]))
      return (
        <>
          <Combobox<Npi>
            label="NPI"
            load={async () => ({ items: npis(10), hasMore: false })}
            getKey={(item) => item.npi}
            getLabel={npiLabel}
            mode="select-only"
            selection={saved}
            text={text}
            onTextChange={setText}
          />
          <button type="button" onClick={() => setText("")}>
            Discard
          </button>
        </>
      )
    }
    render(<Controlled />)
    const input = screen.getByRole("combobox", { name: "NPI" })
    key(input, "ArrowDown")
    await flush()
    expect(screen.getByRole("option", { name: "1000000007, Person 7, Austin, TX" }).getAttribute("aria-selected")).toBe("true")
    key(input, "Escape")
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect((input as HTMLInputElement).value).toBe("")
    key(input, "ArrowDown")
    await flush()
    expect(screen.getAllByRole("option").every((option) => option.getAttribute("aria-selected") === "false")).toBe(true)
  })

  it("a blur because the window lost focus keeps a typed select-only query", () => {
    const { input } = renderNpi({ openOnFocus: false })
    input.focus()
    fireEvent.change(input, { target: { value: "lee" } })
    vi.spyOn(document, "hasFocus").mockReturnValue(false)
    fireEvent.blur(input, { relatedTarget: null })
    expect((input as HTMLInputElement).value).toBe("lee")
    vi.spyOn(document, "hasFocus").mockReturnValue(true)
    // A press on plain page content (no new focus target, the window still focused) is a real leave.
    fireEvent.blur(input, { relatedTarget: null })
    expect((input as HTMLInputElement).value).toBe("")
  })
})

describe("Combobox: async edge cases", () => {
  it("never pages old results when the keyboard opens a new query during debounce", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    fireEvent.change(input, { target: { value: "lee" } })
    key(input, "ArrowDown")
    key(input, "End")
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ query: "lee", page: 0 })
    await advance(600)
    expect(calls).toHaveLength(2)
  })

  it("an empty page with hasMore ends the list (no request loop)", async () => {
    const { input, calls } = renderNpi({ pageSize: undefined })
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(3), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    calls[1].resolve({ items: [], hasMore: true })
    await flush()
    expect(screen.getByRole("option", { name: "No more results" })).toBeTruthy()
    key(input, "End")
    expect(calls).toHaveLength(2)
  })

  it("dedupes items across pages by key; an all-duplicate page ends the list", async () => {
    const { input, calls } = renderNpi({ pageSize: 3 })
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(3), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    calls[1].resolve({ items: npis(3, 2), hasMore: true })
    await flush()
    expect(screen.getAllByRole("option", { name: /Person/ })).toHaveLength(5)
    key(input, "End")
    calls[2].resolve({ items: npis(3, 2), hasMore: true })
    await flush()
    expect(screen.getAllByRole("option", { name: /Person/ })).toHaveLength(5)
    expect(screen.getByRole("option", { name: "No more results" })).toBeTruthy()
  })

  it("turning search off cancels the debounce and the request and closes the list", async () => {
    const { load, calls } = manualLoader()
    function Toggle({ off }: { off: boolean }) {
      return <Combobox<Npi> label="NPI" load={load} getKey={(i) => i.npi} getLabel={npiLabel} mode="free-text" searchDisabled={off} />
    }
    const { rerender } = render(<Toggle off={false} />)
    const input = screen.getByRole("combobox", { name: "NPI" })
    fireEvent.change(input, { target: { value: "ab" } })
    await advance(300)
    fireEvent.change(input, { target: { value: "abc" } })
    rerender(<Toggle off />)
    await advance(1000)
    expect(calls).toHaveLength(1)
    expect(calls[0].signal.aborted).toBe(true)
    rerender(<Toggle off={false} />)
    expect(input.getAttribute("aria-expanded")).toBe("false")
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    expect(screen.queryByRole("option")).toBeNull()
  })

  it("disabling the input cancels pending work too", async () => {
    const { load, calls } = manualLoader()
    function Field({ disabled }: { disabled: boolean }) {
      return <Combobox<Npi> label="NPI" load={load} getKey={(i) => i.npi} getLabel={npiLabel} mode="free-text" disabled={disabled} />
    }
    const { rerender } = render(<Field disabled={false} />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "abc" } })
    rerender(<Field disabled />)
    await advance(1000)
    expect(calls).toHaveLength(0)
  })

  it("unmount cancels the debounce: the loader is never called", async () => {
    const { input, load } = renderNpi({ openOnFocus: false })
    fireEvent.change(input, { target: { value: "lee" } })
    cleanup()
    await advance(1000)
    expect(load).not.toHaveBeenCalled()
  })

  it("unmount aborts the in-flight request", () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    cleanup()
    expect(calls[0].signal.aborted).toBe(true)
  })

  it("clear and select abort the in-flight request", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    // Page 1 is in flight; picking aborts it.
    key(input, "Enter")
    expect(calls[1].signal.aborted).toBe(true)

    fireEvent.change(input, { target: { value: "lee" } })
    await advance(600)
    fireEvent.click(screen.getByRole("button", { name: /^Clear/ }))
    expect(calls[2].signal.aborted).toBe(true)
  })

  it("after a failed later page, closing and reopening keeps the loaded pages and re-requests that page", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    key(input, "ArrowDown")
    key(input, "End")
    calls[1].resolve({ error: true })
    await flush()
    key(input, "Escape")
    key(input, "ArrowDown")
    expect(calls).toHaveLength(2)
    expect(screen.getAllByRole("option")).toHaveLength(10)
    expect(row("error")).toBeNull()
    key(input, "End")
    expect(calls[2]).toMatchObject({ query: "", page: 1 })
  })

  it("a failed first page reloads page 0 on the next open", async () => {
    const { input, calls } = renderNpi()
    fireEvent.focus(input)
    calls[0].resolve({ error: true })
    await flush()
    key(input, "Escape")
    key(input, "ArrowDown")
    expect(calls[1]).toMatchObject({ query: "", page: 0 })
  })

  it("Add is held back while more pages exist, unless the loader says there's no exact match", async () => {
    const { input, calls } = renderNpi({ openOnFocus: false, allowAdd: (name) => formatMessage(COMBOBOX_MESSAGES.addOption, { name }), emptyMessage: undefined })
    fireEvent.change(input, { target: { value: "Person" } })
    await advance(600)
    calls[0].resolve({ items: npis(10), hasMore: true })
    await flush()
    expect(screen.queryByRole("option", { name: "Add “Person”" })).toBeNull()
    fireEvent.change(input, { target: { value: "Persona" } })
    await advance(600)
    calls[1].resolve({ items: npis(10), hasMore: true, exactMatch: false })
    await flush()
    expect(screen.getByRole("option", { name: "Add “Persona”" })).toBeTruthy()
  })
})

describe("Combobox: announcements", () => {
  it("repeats an identical announcement and clears it on close", async () => {
    // quiet: no "Searching…" in between, so two equal counts follow each other.
    const { input, calls } = renderNpi({ openOnFocus: false, quiet: true })
    fireEvent.change(input, { target: { value: "ab" } })
    await advance(600)
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    expect(status()).toBe("2 results")
    fireEvent.change(input, { target: { value: "abc" } })
    await advance(600)
    calls[1].resolve({ items: npis(2), hasMore: false })
    await flush()
    // Same words, different text node content: announced again.
    expect(status()).toBe("2 results ")
    key(input, "Escape")
    expect(status()).toBe("")
  })

  it("quiet: no Searching…, a silent failure clears a stale count, zero results without a listbox say nothing", async () => {
    const { load, calls } = manualLoader()
    render(<Combobox<Npi> label="Address line 1" load={load} getKey={(i) => i.npi} getLabel={npiLabel} mode="free-text" quiet debounceMs={250} />)
    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "12 Main" } })
    await advance(250)
    expect(status()).toBe("")
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    expect(status()).toBe("2 results")
    fireEvent.change(input, { target: { value: "12 Mainx" } })
    await advance(250)
    calls[1].resolve({ error: true })
    await flush()
    expect(status()).toBe("")
    fireEvent.change(input, { target: { value: "12 Mainy" } })
    await advance(250)
    calls[2].resolve({ items: [], hasMore: false })
    await flush()
    expect(input.getAttribute("aria-expanded")).toBe("false")
    expect(status()).toBe("")
  })

  it("static options announce the filtered count", () => {
    render(<Combobox<string> label="Gender identity" staticOptions={["Female", "Male", "Other"]} getKey={(i) => i} getLabel={(i) => i} mode="free-text" />)
    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "ma" } })
    expect(status()).toBe("2 results")
    fireEvent.change(input, { target: { value: "oth" } })
    expect(status()).toBe("1 result")
    fireEvent.change(input, { target: { value: "zz" } })
    expect(status()).toBe("")
  })
})

describe("Combobox: Tab bridge scope", () => {
  async function renderInDialog(after: React.ReactNode) {
    const { load, calls } = manualLoader()
    render(
      <>
        <div role="dialog" aria-label="Edit insurance">
          <Combobox<Npi> label="NPI" load={load} getKey={(i) => i.npi} getLabel={npiLabel} mode="select-only" openOnFocus />
          {after}
        </div>
        <button type="button">Outside</button>
      </>,
    )
    const input = screen.getByRole("combobox", { name: "NPI" })
    input.focus()
    calls[0].resolve({ error: true })
    await flush()
    key(input, "Tab")
    return screen.getByRole("button", { name: "Try again." })
  }

  it("skips hidden elements and stays inside the dialog", async () => {
    const retry = await renderInDialog(
      <>
        <button type="button" style={{ display: "none" }}>
          Hidden
        </button>
        <button type="button">Inside</button>
      </>,
    )
    key(retry, "Tab")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside" }))
  })

  it("never jumps out of the dialog when nothing follows in it", async () => {
    const retry = await renderInDialog(null)
    // The bridge finds nothing and leaves the key alone; the popup's own focus scope keeps it on the button.
    fireEvent.keyDown(retry, { key: "Tab" })
    expect(document.activeElement).toBe(retry)
  })
})

describe("Combobox: inputRef (F6-2)", () => {
  it("hands the text input to an object ref and a callback ref, and clears them on unmount", () => {
    const objectRef = React.createRef<HTMLInputElement>()
    const { input } = renderNpi({ inputRef: objectRef })
    expect(objectRef.current).toBe(input)
    cleanup()
    expect(objectRef.current).toBeNull()

    const callback = vi.fn<(element: HTMLInputElement | null) => void>()
    const second = renderNpi({ inputRef: callback })
    expect(callback).toHaveBeenLastCalledWith(second.input)
    // The form focuses the field through the ref.
    callback.mock.lastCall?.[0]?.focus()
    expect(document.activeElement).toBe(second.input)
  })
})

describe("Combobox: editing labels beyond the query cap", () => {
  const long = { npi: "1987654321", name: "Synthetic practice organization ".repeat(5), city: "Austin, TX" }
  const pick = { type: "option" as const, item: long }

  it.each(["x", "Backspace", "Delete"])("prepares the whole long label for %s without changing the native cap", (pressed) => {
    const { input } = renderNpi({ defaultSelection: pick })
    const field = input as HTMLInputElement
    field.setSelectionRange(field.value.length, field.value.length)
    key(input, "End")
    expect(field.selectionStart).toBe(field.value.length)
    key(input, pressed)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(npiLabel(long).length)
    expect(field.maxLength).toBe(100)
  })

  it("preserves typed content as the new query and drops the pick", async () => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    key(input, "x")
    fireEvent.change(input, { target: { value: "x" } })
    await advance(600)
    expect(calls[0].query).toBe("x")
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
    expect(input).toHaveProperty("value", "x")
  })

  it("prepares paste and bounds the newly pasted query instead of keeping the old label", async () => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    fireEvent.paste(input)
    expect((input as HTMLInputElement).selectionStart).toBe(0)
    const pasted = "New pasted practice ".repeat(10)
    // jsdom does not apply the native paste/default maxlength behavior.
    fireEvent.change(input, { target: { value: pasted.slice(0, 100) } })
    await advance(600)
    expect(input).toHaveProperty("value", pasted.slice(0, 100))
    expect(calls[0].query).toBe(pasted.slice(0, 100).trim())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
  })

  it.each([
    ["病院".repeat(60), "病院".repeat(50)],
    [`a${"😀".repeat(60)}`, `a${"😀".repeat(49)}`],
  ])("buffers long-pick composition and commits a bounded intact query", async (composed, expected) => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    fireEvent.compositionStart(input)
    expect((input as HTMLInputElement).selectionStart).toBe(0)
    fireEvent.change(input, { target: { value: composed } })
    key(input, "Enter", { isComposing: true })
    key(input, "Enter")
    fireEvent.keyPress(input, { key: "x", charCode: 120, which: 120 })
    await advance(600)
    expect(calls).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).toHaveProperty("value", composed)
    fireEvent.compositionEnd(input, { data: composed })
    await advance(600)
    expect(input).toHaveProperty("value", expected)
    expect(calls[0].query).toBe(expected)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("keeps ordinary short selections and uncapped free text edit semantics", async () => {
    const { input } = renderNpi({ defaultSelection: { type: "option", item: npis(1)[0] } })
    const field = input as HTMLInputElement
    field.setSelectionRange(field.value.length, field.value.length)
    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input)
    key(input, "x")
    expect(field.selectionStart).toBe(field.value.length)
    const ordinaryComposition = "病院".repeat(60)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: ordinaryComposition } })
    expect(input).toHaveProperty("value", ordinaryComposition)
    fireEvent.compositionEnd(input)
    cleanup()
    const free = renderNpi({ mode: "free-text", maxLength: undefined, defaultSelection: pick })
    const uncapped = free.input as HTMLInputElement
    uncapped.setSelectionRange(uncapped.value.length, uncapped.value.length)
    key(free.input, "x")
    expect(uncapped.selectionStart).toBe(uncapped.value.length)
    fireEvent.change(free.input, { target: { value: `${npiLabel(long)}x` } })
    expect(free.input).toHaveProperty("value", `${npiLabel(long)}x`)
  })

  it.each(["insertReplacementText", "deleteContentBackward"])("prepares real native %s edits without keyboard fallbacks", async (inputType) => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    const field = input as HTMLInputElement
    field.setSelectionRange(7, 9)
    field.dispatchEvent(new InputEvent("beforeinput", { inputType, data: "new", bubbles: true, cancelable: true }))
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(npiLabel(long).length)
    const replacement = inputType.startsWith("insert") ? "new" : ""
    field.setRangeText(replacement, field.selectionStart!, field.selectionEnd!, "end")
    fireEvent.input(field, { inputType })
    await advance(600)
    expect(calls[0].query).toBe(replacement)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("leaves ordinary free-text and composing native events untouched", () => {
    const { input } = renderNpi({ mode: "free-text", defaultText: "ordinary" })
    const field = input as HTMLInputElement
    field.setSelectionRange(3, 3)
    field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertReplacementText", bubbles: true }))
    expect(field.selectionStart).toBe(3)
    cleanup()
    const picked = renderNpi({ defaultSelection: pick }).input as HTMLInputElement
    picked.setSelectionRange(3, 3)
    picked.dispatchEvent(new InputEvent("beforeinput", { inputType: "historyUndo", bubbles: true }))
    picked.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertCompositionText", isComposing: true, bubbles: true }))
    expect(picked.selectionStart).toBe(3)
  })

  it("preserves the full valid pick when a composition is unchanged or cancelled", async () => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input)
    expect(input).toHaveProperty("value", npiLabel(long))
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: "pre-edit" } })
    fireEvent.compositionEnd(input, { target: { value: npiLabel(long) }, data: "" })
    await advance(600)
    expect(input).toHaveProperty("value", npiLabel(long))
    expect(calls).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it.each(["text", "selection"])("retires composition when its controlled %s is reset", (reset) => {
    const onTextChange = vi.fn()
    const onSelect = vi.fn()
    const label = npiLabel(long)
    function Controlled({ cleared }: { cleared: boolean }) {
      return <Combobox label="Controlled long pick" mode="select-only" maxLength={100} getKey={(item: string) => item} getLabel={(item: string) => item} text={cleared && reset === "text" ? "" : label} selection={cleared ? null : { type: "option", item: label }} onTextChange={onTextChange} onSelect={onSelect} />
    }
    const view = render(<Controlled cleared={false} />)
    const input = screen.getByRole("combobox")
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: "pre-edit" } })
    view.rerender(<Controlled cleared />)
    const expected = reset === "text" ? "" : label
    expect(input).toHaveProperty("value", expected)
    fireEvent.change(input, { target: { value: "stale pre-edit" } })
    fireEvent.compositionEnd(input, { target: { value: "stale commit" }, data: "stale commit" })
    expect(input).toHaveProperty("value", expected)
    expect(onTextChange).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("bounds a partial Cut by preparing the whole overlong pick", async () => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    const field = input as HTMLInputElement
    field.setSelectionRange(3, 5)
    fireEvent.cut(field)
    field.setRangeText("", field.selectionStart!, field.selectionEnd!, "end")
    fireEvent.input(field, { inputType: "deleteByCut" })
    await advance(600)
    expect(field.value).toBe("")
    expect(calls[0].query).toBe("")
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
  })

  it("closes and aborts a reopened pending search when long-pick composition begins", async () => {
    const { input, calls, onSelect } = renderNpi({ defaultSelection: pick })
    key(input, "ArrowDown")
    expect(calls).toHaveLength(1)
    fireEvent.compositionStart(input)
    expect(calls[0].signal.aborted).toBe(true)
    expect(input.getAttribute("aria-expanded")).toBe("false")
    calls[0].resolve({ items: npis(2), hasMore: false })
    await flush()
    expect(screen.queryByRole("option")).toBeNull()
    fireEvent.compositionEnd(input)
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).toHaveProperty("value", npiLabel(long))
  })

  it("ordinary composing Enter keeps an active static free-text option unselected", () => {
    const onSelect = vi.fn()
    render(<Combobox label="Static free text" mode="free-text" defaultText="A" staticOptions={["Alpha", "Beta"]} getKey={(item) => item} getLabel={(item) => item} onSelect={onSelect} />)
    const input = screen.getByRole("combobox")
    key(input, "ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy()
    key(input, "Enter", { isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
    expect(input).toHaveProperty("value", "A")
    key(input, "Enter")
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ type: "option", item: "Alpha" })
  })
})

describe("Combobox: capped edits and settled-query isolation", () => {
  it("replaces an exactly capped selected label on its first edit", async () => {
    const item = { npi: "1987654321", name: "Exact cap", city: "Austin" }
    const cap = npiLabel(item).length
    const { input, calls, onSelect } = renderNpi({ maxLength: cap, defaultSelection: { type: "option", item } })
    const field = input as HTMLInputElement
    field.setSelectionRange(cap, cap)
    key(field, "x")
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(cap)
    fireEvent.change(field, { target: { value: "x" } })
    await advance(600)
    expect(calls[0].query).toBe("x")
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(null)
  })

  it.each(["", "short"])("buffers ordinary capped composition from %j until a Unicode-safe bounded commit", async (defaultText) => {
    const { input, calls } = renderNpi({ defaultText, mode: "free-text", maxLength: 5 })
    fireEvent.compositionStart(input)
    const composed = "😀".repeat(4)
    fireEvent.change(input, { target: { value: composed } })
    await advance(600)
    expect(calls).toHaveLength(0)
    expect(input).toHaveProperty("value", composed)
    fireEvent.compositionEnd(input, { data: composed })
    await advance(600)
    expect(input).toHaveProperty("value", "😀😀")
    expect(calls[0].query).toBe("😀😀")
  })

  it("retains uncapped composition text and its existing input forwarding", async () => {
    const { input, calls } = renderNpi({ maxLength: undefined, mode: "free-text" })
    const composed = "病院".repeat(80)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: composed } })
    await advance(600)
    expect(calls[0].query).toBe(composed)
    fireEvent.compositionEnd(input, { data: composed })
    expect(input).toHaveProperty("value", composed)
  })

  it("removes settled Ann options immediately while Bob debounces, before Bob can load", async () => {
    const { input, calls, onSelect } = renderNpi()
    fireEvent.change(input, { target: { value: "Ann" } })
    await advance(600)
    calls[0].resolve({ items: npis(1), hasMore: false })
    await flush()
    expect(screen.getByRole("option", { name: npiLabel(npis(1)[0]) })).toBeTruthy()
    fireEvent.change(input, { target: { value: "Bob" } })
    expect(screen.queryByRole("option")).toBeNull()
    expect(input.getAttribute("aria-activedescendant")).toBeNull()
    key(input, "Enter")
    expect(onSelect).not.toHaveBeenCalled()
    await advance(599)
    expect(calls).toHaveLength(1)
    await advance(1)
    expect(calls[1].query).toBe("Bob")
  })
})
