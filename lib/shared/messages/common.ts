/**
 * Actions and values shared by several surfaces, and by both teams (spec
 * F6-3 added the generic row/dialog words so no area file re-declares them;
 * the catalog uniqueness test rejects a duplicate). "Edit" stays in
 * `SECTION_MESSAGES.edit`; "Try again." in `CONTROL_MESSAGES.tryAgain`.
 */
export const COMMON_MESSAGES = {
  cancel: "Cancel",
  save: "Save",
  retry: "Retry",
  discard: "Discard", // the leave guard and the draft restore banner
  restore: "Restore", // the draft restore banner (and the removed draft row, Team A)
  notProvided: "Not provided",
  optionalSuffix: "(optional)", // DRAFT COPY (the muted suffix of EXPERIENCE.md "{Label} (optional)")
  dismissNotification: "Dismiss notification", // DRAFT COPY (toast close button name, F3-1)
  // Generic actions (spec F6-3). Verbatim where Voice and Tone quotes them.
  close: "Close", // DRAFT COPY (epics Story 8.2 sheet close button; Insurance editor close)
  remove: "Remove", // verbatim: EXPERIENCE.md Voice and Tone, "Card images" (also the row menu item)
  delete: "Delete", // DRAFT COPY (epics Story 5.5 insurance card menu item)
  replace: "Replace", // verbatim: EXPERIENCE.md Voice and Tone, "Card images"
  clear: "Clear", // verbatim: EXPERIENCE.md Voice and Tone, "Signature"
  submit: "Submit", // verbatim: EXPERIENCE.md Voice and Tone, "Authenticator — dialog"
  back: "Back", // DRAFT COPY (DESIGN.md Insurance editor mobile back control)
  previous: "Previous", // DRAFT COPY (EXPERIENCE.md My Organizations pagination)
  next: "Next", // DRAFT COPY (EXPERIENCE.md My Organizations pagination)
  moreActionsFor: "More actions for {name}", // DRAFT COPY (EXPERIENCE.md row kebab name, "More actions for +1 (415) 551-2125")
  // Contact rows (Epic 3 phones and emails, Story 4.1 addresses, Story 7.6 pickers).
  primary: "Primary", // DRAFT COPY (DESIGN.md Primary chip)
  makePrimary: "Make primary", // verbatim: EXPERIENCE.md Voice and Tone, "Primary change confirm"
  verified: "Verified", // DRAFT COPY (DESIGN.md status-verified)
  notVerified: "Not verified", // DRAFT COPY (DESIGN.md status-not-verified)
  verify: "Verify", // DRAFT COPY (DESIGN.md inline row action)
  resendVerification: "Resend verification", // verbatim: EXPERIENCE.md Voice and Tone, "Verify pending"
} as const
