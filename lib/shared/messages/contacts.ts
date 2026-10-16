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
  // Phone edit view (Story 3.2).
  addPhone: "Add phone",
  phoneMinimum: "You need at least one phone",
  phoneLimit: "You've reached the limit of 20 phones",
  phoneLocked: "Saved numbers can't be changed. Remove it and add a new one.", // DRAFT COPY (epics Story 3.2 locked Number and Type)
  phoneNewHelp: "Include the area code. Mobile numbers get a verification link by text after you save.", // DRAFT COPY (epics Story 3.2 new number help)
  chooseLabel: "Choose a label", // DRAFT COPY (epics Story 3.2 empty Label)
  choosePhoneType: "Choose Mobile or Landline", // DRAFT COPY (epics Story 3.2 empty Type)
  labelNotOffered: "Choose a label from the list", // DRAFT COPY (spec 3.2 INVALID_ENUM_VALUE)
  phonePrimaryFirst: "Make another phone primary first", // verbatim: EXPERIENCE.md Voice and Tone, "Disabled Remove (Primary)"
  addRow: "Add row", // DRAFT COPY (epics Story 3.2 table footer action)
} as const
