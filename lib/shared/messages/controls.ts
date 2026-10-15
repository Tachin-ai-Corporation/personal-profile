/**
 * Generic copy of the shared input controls (F5-1): the info-popover state
 * slots (Stories 9.1, 9.3, 10.2 supply only their content; a story's own
 * error line lives in its area file) and the date input's calendar button.
 * The no-access state reuses `STATE_MESSAGES.noAccess`.
 */
export const CONTROL_MESSAGES = {
  loading: "Loading…", // DRAFT COPY (epics Story 9.3 popover loading)
  loadError: "Couldn't load this information.", // DRAFT COPY (F5-1 info-popover default error)
  tryAgain: "Try again.", // DRAFT COPY (epics Story 9.3 retry; V&T style of "Couldn't load results. Try again.")
  chooseDate: "Choose date", // DRAFT COPY (F5-1 calendar button and dialog name)
  datePlaceholder: "MM/DD/YYYY", // DRAFT COPY (F5-1 date input format hint)
} as const
