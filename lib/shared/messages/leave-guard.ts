/** The leave guard (Story 1.13); its Save and Discard buttons are `COMMON_MESSAGES.save` / `COMMON_MESSAGES.discard`. */
export const LEAVE_GUARD_MESSAGES = {
  title: "You have unsaved changes",
  keepEditing: "Keep editing",
  body: "Save your changes before you leave, or discard them.", // DRAFT COPY (Story 1.13 body)
  bodyCannotSave: "These changes can't be saved from here. Keep editing to finish them, or discard them.", // DRAFT COPY (Story 1.13 canSave:false)
} as const
