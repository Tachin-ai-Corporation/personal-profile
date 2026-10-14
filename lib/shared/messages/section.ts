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
  noChanges: "There are no changes", // verbatim: EXPERIENCE.md Voice and Tone, "Account settings — save"
  invalidOne: "{section} has 1 field to fix", // verbatim: EXPERIENCE.md Voice and Tone, "Unsaved" ("Email has 1 field to fix")
  invalidMany: "{section} has {count} fields to fix", // DRAFT COPY (Story 1.14 plural of "Email has 1 field to fix")
} as const
