"use client"

import { InlineBanner } from "@/components/ui/inline-banner"
import { useNpiRegistration, type NpiRegistrationProps } from "./use-npi-registration"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxOptionText, type ComboboxLoader } from "@/components/ui/combobox"
import { mapApiError, NPI_PAGE_SIZE, NPI_SEARCH_MAX_LENGTH, searchPersonalNpi, searchPracticeNpi, sessionEvents, type NpiOption } from "@/lib/api"
import { COMBOBOX_MESSAGES, NPI_MESSAGES } from "@/lib/shared/messages"

function renderNpiOption(item: NpiOption) {
  return <ComboboxOptionText line1={<><span className="mono-value">{item.npi}</span>{" "}<span className="cell-strong">{item.name}</span></>} line2={[item.addressLine1, item.city, item.state].filter(Boolean).join(", ")} />
}

/** Queries, options and picks are owned by these controls and discarded on unmount. */
export function NpiSearch({ onFailure, onRegistered }: NpiRegistrationProps) {
  const registration = useNpiRegistration({ onFailure, onRegistered })
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
  return <form noValidate onSubmit={registration.submit} className="control-max-wide flex w-full min-w-0 flex-col gap-4">
    <p className="text-body font-medium">{NPI_MESSAGES.instructions}</p>
    {registration.banner ? <InlineBanner variant="error" announceKey={registration.banner.attempt}>{registration.banner.text}</InlineBanner> : null}
    <Combobox key={`personal-${registration.resetKey}`} {...common} label={NPI_MESSAGES.personalSearch} required load={loader(searchPersonalNpi)}
      selection={registration.personalSelection ? { type: "option", item: registration.personalSelection } : null}
      onSelect={(pick) => registration.change("personalNpi", pick?.type === "option" ? pick.item : null)}
      onClear={() => registration.change("personalNpi", null)} inputRef={registration.personalInput} onBlur={registration.personalBlur} disabled={registration.busy} error={registration.errors.personalNpi?.message} />
    <Combobox key={`practice-${registration.resetKey}`} {...common} label={NPI_MESSAGES.practiceSearch} optional load={loader(searchPracticeNpi)}
      selection={registration.practiceSelection ? { type: "option", item: registration.practiceSelection } : null}
      onSelect={(pick) => registration.change("practiceNpi", pick?.type === "option" ? pick.item : null)}
      onClear={() => registration.change("practiceNpi", null)} inputRef={registration.practiceInput} disabled={registration.busy} error={registration.errors.practiceNpi?.message} />
    <div className="flex justify-end"><Button type="submit" size="touch" busy={registration.busy} busyLabel={NPI_MESSAGES.registering}>{NPI_MESSAGES.register}</Button></div>
  </form>
}
