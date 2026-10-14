/**
 * Copy of the shared async combobox (F5-2): the generic listbox rows and
 * announcements, plus the four variants' fixed strings (NPI 9.1, Address
 * line 1 4.3, Insurer 5.2, Gender identity 2.2), kept here once so those
 * stories pass them as props instead of adding a second copy. "Try again."
 * is `CONTROL_MESSAGES.tryAgain` (F5-1).
 */
export const COMBOBOX_MESSAGES = {
  searching: "Searching…",
  loadError: "Couldn't load results.", // DRAFT COPY (V&T "Couldn't load results. Try again." without the shared "Try again." button)
  noMoreResults: "No more results",
  resultCount: "{N} results", // DRAFT COPY (epics Story 9.1 polite result count)
  resultCountOne: "1 result", // DRAFT COPY (singular of "{N} results")
  cleared: "Cleared", // DRAFT COPY (epics Story 9.1 clear announcement)
  clearLabel: "Clear {label}", // DRAFT COPY (epics Story 9.1 clear button name)
  addOption: "Add “{name}”",
  npiPlaceholder: "Search by NPI or name",
  npiNoMatches: "No matching NPI found",
  addressHelp: "Pick a suggestion to fill the rest and verify the address.",
  insurerHelp: "Search the list, or add your insurer by name if it isn't there.",
  genderIdentityHelp: "Choose from the list or type your own.",
} as const
