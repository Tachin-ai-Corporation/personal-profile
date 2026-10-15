"use client"

import { useRef, useState } from "react"
import { Combobox, ComboboxOptionText, type ComboboxLoadResult, type ComboboxSelection } from "@/components/ui/combobox"
import { COMBOBOX_MESSAGES, formatMessage } from "@/lib/shared/messages"

/**
 * Test-only gallery of the F5-2 combobox variants with fake loaders (e2e:
 * axe in light and dark, keyboard and touch, paging, retry, 360 px). Not app
 * UI; names and data are fixture data, not catalog copy. Every request is
 * logged as `query|page` so e2e can assert debounce and retry.
 *
 * NPI: 25 people, 10 per page; the query "error" fails once per page, "zzz"
 * finds nothing. Address: a query containing "fail" fails (silently).
 */

interface Npi {
  readonly npi: string
  readonly first: string
  readonly last: string
  readonly city: string
  readonly state: string
}

const LAST_NAMES = ["Lee", "Garcia", "Patel", "Nguyen", "Smith"]
const PEOPLE: readonly Npi[] = Array.from({ length: 25 }, (_, i) => ({
  npi: String(1234500000 + i),
  first: `Person${String(i).padStart(2, "0")}`,
  last: LAST_NAMES[i % LAST_NAMES.length],
  city: "Austin",
  state: "TX",
}))
const NPI_PAGE = 10
const npiLabel = (item: Npi): string => `${item.npi}, ${item.first} ${item.last}, ${item.city}, ${item.state}`

const STREETS = ["12 Main St", "12 Main Ave", "12 Main Rd", "12 Main Ct", "12 Main Ln", "12 Main Way", "40 Oak St"]
const INSURERS = ["Aetna", "Acme Health", "Blue Cross", "Cigna", "Humana", "United Healthcare"]
const GENDERS = ["Asked but not answered", "Female", "Male", "Other"]

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const aborted = () => new DOMException("Aborted", "AbortError")
    if (signal.aborted) {
      reject(aborted())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(aborted())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })

export function ComboboxFixture() {
  const [log, setLog] = useState<string[]>([])
  const [npi, setNpi] = useState("")
  const [sectionEscapes, setSectionEscapes] = useState(0)
  const [address, setAddress] = useState("")
  const [suggestions, setSuggestions] = useState(true)
  const [insurer, setInsurer] = useState("")
  const [gender, setGender] = useState("Asked but not answered")
  const failed = useRef(new Set<string>())

  const record = (entry: string) => setLog((previous) => [...previous, entry])

  const loadNpi = async (query: string, page: number, signal: AbortSignal): Promise<ComboboxLoadResult<Npi>> => {
    record(`${query}|${page}`)
    await wait(300, signal)
    if (query === "error" && !failed.current.has(`${query}|${page}`)) {
      failed.current.add(`${query}|${page}`)
      return { error: true }
    }
    const lower = query === "error" ? "" : query.toLowerCase()
    const matches = PEOPLE.filter((p) => p.npi.startsWith(lower) || `${p.first} ${p.last}`.toLowerCase().includes(lower))
    const items = matches.slice(page * NPI_PAGE, (page + 1) * NPI_PAGE)
    return { items, hasMore: (page + 1) * NPI_PAGE < matches.length }
  }

  const loadAddress = async (query: string, _page: number, signal: AbortSignal): Promise<ComboboxLoadResult<string>> => {
    await wait(150, signal)
    if (query.toLowerCase().includes("fail")) return { error: true }
    return { items: STREETS.filter((s) => s.toLowerCase().includes(query.toLowerCase())), hasMore: false }
  }

  const loadInsurers = async (query: string, _page: number, signal: AbortSignal): Promise<ComboboxLoadResult<string>> => {
    await wait(150, signal)
    return { items: INSURERS.filter((s) => s.toLowerCase().includes(query.toLowerCase())), hasMore: false }
  }

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col gap-6 p-4 md:p-6">
      <h1 className="text-h4 font-semibold">Combobox</h1>

      <section
        aria-label="Healthcare credentials"
        className="flex max-w-[720px] flex-col gap-4"
        onKeyDown={(event) => {
          if (event.key === "Escape") setSectionEscapes((n) => n + 1)
        }}
      >
        <Combobox<Npi>
          label="Search for your personal NPI number"
          required
          placeholder={COMBOBOX_MESSAGES.npiPlaceholder}
          load={loadNpi}
          getKey={(item) => item.npi}
          getLabel={npiLabel}
          debounceMs={600}
          maxLength={100}
          pageSize={NPI_PAGE}
          openOnFocus
          mode="select-only"
          searchIcon
          optionLayout="two-line"
          renderOption={(item) => (
            <ComboboxOptionText
              line1={
                <>
                  <span className="font-mono">{item.npi}</span> {item.first} {item.last}
                </>
              }
              line2={`${item.city}, ${item.state}`}
            />
          )}
          emptyMessage={COMBOBOX_MESSAGES.npiNoMatches}
          endMessage={COMBOBOX_MESSAGES.noMoreResults}
          onSelect={(selection: ComboboxSelection<Npi> | null) => setNpi(selection?.type === "option" ? selection.item.npi : "")}
        />
        <p>
          Selected NPI: <output data-testid="npi-value">{npi}</output> · Section Escapes:{" "}
          <output data-testid="section-escapes">{sectionEscapes}</output>
        </p>
        <p>
          Requests: <output data-testid="npi-log">{log.join(" ")}</output>
        </p>
      </section>

      <section aria-label="Address" className="flex max-w-[480px] flex-col gap-4">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={suggestions} onChange={(event) => setSuggestions(event.target.checked)} />
          Country supports suggestions
        </label>
        <Combobox<string>
          label="Address line 1"
          help={suggestions ? COMBOBOX_MESSAGES.addressHelp : undefined}
          load={loadAddress}
          getKey={(item) => item}
          getLabel={(item) => item}
          debounceMs={250}
          minChars={3}
          maxResults={5}
          mode="free-text"
          quiet
          highlightMatch
          searchDisabled={!suggestions}
          text={address}
          onTextChange={setAddress}
        />
        <p>
          Address line 1: <output data-testid="address-value">{address}</output>
        </p>
      </section>

      <section aria-label="Insurance" className="flex max-w-[480px] flex-col gap-4">
        <Combobox<string>
          label="Insurer"
          help={COMBOBOX_MESSAGES.insurerHelp}
          load={loadInsurers}
          getKey={(item) => item}
          getLabel={(item) => item}
          debounceMs={300}
          minChars={2}
          pageSize={20}
          mode="select-only"
          searchIcon
          allowAdd={(name) => formatMessage(COMBOBOX_MESSAGES.addOption, { name })}
          onSelect={(selection) =>
            setInsurer(selection === null ? "" : selection.type === "add" ? `new: ${selection.text}` : `listed: ${selection.item}`)
          }
        />
        <p>
          Insurer: <output data-testid="insurer-value">{insurer}</output>
        </p>
      </section>

      <section aria-label="Personal information" className="flex max-w-[480px] flex-col gap-4">
        <Combobox<string>
          label="Gender identity"
          required
          help={COMBOBOX_MESSAGES.genderIdentityHelp}
          staticOptions={GENDERS}
          getKey={(item) => item}
          getLabel={(item) => item}
          mode="free-text"
          maxLength={128}
          text={gender}
          onTextChange={setGender}
        />
        <p>
          Gender identity: <output data-testid="gender-value">{gender}</output>
        </p>
        <button type="button" className="text-link-text focus-ring min-h-11 self-start rounded-md px-2 outline-none">
          After the fields
        </button>
      </section>
      {/* Room below, so the lists open downward and the page can scroll. */}
      <div aria-hidden="true" className="h-[60vh]" />
    </main>
  )
}
