/** Section framework copy (Stories 1.11, 1.12). */
export const SECTION_MESSAGES = {
  edit: "Edit", // DRAFT COPY (EXPERIENCE.md Section header)
  editing: "Editing", // DRAFT COPY (epic 7 edit view label)
  saving: "Saving…", // DRAFT COPY (EXPERIENCE.md Saving state)
  unsavedChanges: "Unsaved changes",
  saved: "{section} saved.",
  networkFailure: "Couldn't save {section}. Check your connection.",
  saveFailed: "Couldn't save {section}.", // DRAFT COPY (Story 1.12 generic Section save error)
  allSaved: "All saved.", // DRAFT COPY (Save all success toast; EXPERIENCE.md "never All saved unless every save succeeded")
  partialSaved: "{saved} saved, {failed} failed",
  savedCount: "{saved} saved.", // DRAFT COPY (Save all success when the user cancelled a Section's save, F6-1)
  noChanges: "There are no changes", // verbatim: EXPERIENCE.md Voice and Tone, "Account settings — save"
  invalidOne: "{section} has 1 field to fix", // verbatim: EXPERIENCE.md Voice and Tone, "Unsaved" ("Email has 1 field to fix")
  invalidMany: "{section} has {count} fields to fix", // DRAFT COPY (Story 1.14 plural of "Email has 1 field to fix")
  // Shared UI kit (F6-2). Generic words not (yet) in COMMON_MESSAGES; spec F6-3 may move them there.
  close: "Close", // DRAFT COPY (dialog and sheet close button, epics Story 8.2)
  back: "Back", // DRAFT COPY (mobile sheet back control, DESIGN.md Insurance editor)
  remove: "Remove",
  removedOnSave: "Removed on save",
  newNotSaved: "New · not saved",
  moreActionsFor: "More actions for {name}", // DRAFT COPY (EXPERIENCE.md Accessibility Floor kebab name)
  actionsColumn: "Actions", // DRAFT COPY (visually hidden header of the row actions column)
  overflowCount: "+{count}", // DRAFT COPY (DESIGN.md overflow-chip "+N")
  countryCode: "Country code", // DRAFT COPY (phone input country picker name)
  phoneInvalid: "Enter a valid phone number", // DRAFT COPY (epics Story 3.2 non-US number)
} as const
