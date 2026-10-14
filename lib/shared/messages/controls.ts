/**
 * Generic copy of the shared input controls (F5-1): the info-popover state
 * slots (Stories 9.1, 9.3, 10.2 supply only their content) and the date
 * input's calendar button. Its no-access state reuses `STATE_MESSAGES.noAccess`.
 */
export const CONTROL_MESSAGES = {
  loading: "Loading…", // DRAFT COPY (epics Story 9.3 popover loading)
  supportContactLoadError: "Couldn't load the support contact.", // DRAFT COPY (epics Story 9.3 popover error)
  tryAgain: "Try again.", // DRAFT COPY (epics Story 9.3 retry; V&T style of "Couldn't load results. Try again.")
  chooseDate: "Choose date", // DRAFT COPY (F5-1 calendar button and dialog name)
  datePlaceholder: "MM/DD/YYYY", // DRAFT COPY (F5-1 date input format hint)
} as const
