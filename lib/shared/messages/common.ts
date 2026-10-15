/** Actions and values shared by several surfaces. */
export const COMMON_MESSAGES = {
  cancel: "Cancel",
  save: "Save",
  retry: "Retry",
  discard: "Discard", // the leave guard and the draft restore banner
  restore: "Restore", // the draft restore banner (and the removed draft row, Team A)
  notProvided: "Not provided",
  optionalSuffix: "(optional)", // DRAFT COPY (the muted suffix of EXPERIENCE.md "{Label} (optional)")
  dismissNotification: "Dismiss notification", // DRAFT COPY (toast close button name, F3-1)
} as const
