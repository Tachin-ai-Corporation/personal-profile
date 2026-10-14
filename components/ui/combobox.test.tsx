import { act, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { COMBOBOX_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { FakeIntersectionObserver, reportIntersections, stubLayoutApis } from "@/test/dom-stubs"
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
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")

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
    last.id = "last-option"
    reportIntersections({ "last-option": true })
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
    const home = fireEvent.keyDown(input, { key: "Home" })
    expect(home).toBe(true)
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
    const { input } = renderNpi({ openOnFocus: false })
    input.focus()
    fireEvent.change(input, { target: { value: "lee" } })
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "After" }) })
    expect((input as HTMLInputElement).value).toBe("")
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
    expect(screen.getAllByRole("option")[0].querySelector("svg")).not.toBeNull()
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
        allowAdd={(name) => `Add “${name}”`}
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

  it("renders plain text for an empty query", () => {
    const { container } = render(<HighlightMatch text="Main" query="" />)
    expect(container.innerHTML).toBe("Main")
  })
})
