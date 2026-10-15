/**
 * Draft restore and conflict copy (Story 1.15, F4). "Restore" and "Discard"
 * are shared actions: `COMMON_MESSAGES.restore` / `COMMON_MESSAGES.discard`.
 */
export const DRAFT_MESSAGES = {
  restoreBody: "You have unsaved changes from your last visit.",
  conflictBody: "This section changed since your draft. Choose which version to keep.",
  yourVersion: "Your version",
  current: "Current",
  keepMine: "Keep mine",
  useCurrent: "Use current",
} as const
