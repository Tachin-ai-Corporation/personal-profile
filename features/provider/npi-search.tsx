"use client"

import { Button } from "@/components/ui/button"
import { Combobox, ComboboxOptionText, type ComboboxLoader } from "@/components/ui/combobox"
import { mapApiError, NPI_PAGE_SIZE, NPI_SEARCH_MAX_LENGTH, searchPersonalNpi, searchPracticeNpi, sessionEvents, type MappedError, type NpiOption } from "@/lib/api"
import { COMBOBOX_MESSAGES, NPI_MESSAGES } from "@/lib/shared/messages"

function renderNpiOption(item: NpiOption) {
  return <ComboboxOptionText line1={<><span className="mono-value">{item.npi}</span>{" "}<span className="cell-strong">{item.name}</span></>} line2={[item.addressLine1, item.city, item.state].filter(Boolean).join(", ")} />
}

/** Queries, options and picks are owned by these controls and discarded on unmount. */
export function NpiSearch({ onFailure }: { readonly onFailure: (error: MappedError) => void }) {
  const loader = (search: typeof searchPersonalNpi): ComboboxLoader<NpiOption> => async (searchText, page, signal) => {
    const response = await search({ searchText, page }, signal)
    if (signal.aborted || sessionEvents.hasPublished("session-expired")) return { error: true }
    if (!response.success || !response.data) {
      onFailure(mapApiError("provider", response))
      return { error: true }
    }
    return { items: response.data.items, hasMore: response.data.hasMore }
  }
  const common = {
    mode: "select-only" as const, openOnFocus: true, debounceMs: 600,
    maxLength: NPI_SEARCH_MAX_LENGTH, pageSize: NPI_PAGE_SIZE, searchIcon: true,
    placeholder: COMBOBOX_MESSAGES.npiPlaceholder, emptyMessage: COMBOBOX_MESSAGES.npiNoMatches,
    endMessage: COMBOBOX_MESSAGES.noMoreResults, optionLayout: "two-line" as const,
    getKey: (item: NpiOption) => String(item.id), getLabel: (item: NpiOption) => item.label,
    renderOption: renderNpiOption,
  }
  return <div className="control-max-wide flex w-full min-w-0 flex-col gap-4">
    <p className="text-body font-medium">{NPI_MESSAGES.instructions}</p>
    <Combobox {...common} label={NPI_MESSAGES.personalSearch} required load={loader(searchPersonalNpi)} />
    <Combobox {...common} label={NPI_MESSAGES.practiceSearch} optional load={loader(searchPracticeNpi)} />
    <div className="flex justify-end"><Button type="button">{NPI_MESSAGES.register}</Button></div>
  </div>
}
