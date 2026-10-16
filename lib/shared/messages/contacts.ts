/** Contacts copy: the shared error tables (`lib/api/errors/contacts.ts`), the F3-2 fixture Section and the Epic 3 Sections. */
export const CONTACT_MESSAGES = {
  duplicatePhone: "This number is already on your profile",
  phoneTenDigits: "Enter a 10-digit US number", // verbatim: EXPERIENCE.md Voice and Tone, "Validation"
  duplicateEmail: "This email is already on your profile", // DRAFT COPY (contact duplicate, error table)
  duplicateSocial: "This link is already on your profile", // DRAFT COPY (contact duplicate, error table)
  // Phone read view (Story 3.1).
  phonesEmpty: "No phones yet", // verbatim: EXPERIENCE.md Voice and Tone, "Empty Section"
  phoneTypeMobile: "Mobile", // DRAFT COPY (epics Story 3.1 Type column)
  phoneTypeLandline: "Landline", // DRAFT COPY (epics Story 3.1 Type column)
  notificationsOn: "On", // DRAFT COPY (epics Story 3.1 Notifications column, Primary row)
  notificationsOff: "Off", // DRAFT COPY (epics Story 3.1 Notifications column, Primary row)
  notificationsNotApplicable: "—", // DRAFT COPY (epics Story 3.1 Notifications column, every other row, RC3; shown aria-hidden)
  notificationsNotApplicableLabel: "Not applicable", // DRAFT COPY (the visually hidden meaning of the "—")
} as const
