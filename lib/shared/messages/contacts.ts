/** Contacts copy needed by the shared error tables (`lib/api/errors/contacts.ts`) and the F3-2 fixture Section; Epic 3 adds the rest. */
export const CONTACT_MESSAGES = {
  duplicatePhone: "This number is already on your profile",
  phoneTenDigits: "Enter a 10-digit US number", // verbatim: EXPERIENCE.md Voice and Tone, "Validation"
  duplicateEmail: "This email is already on your profile", // DRAFT COPY (contact duplicate, error table)
  duplicateSocial: "This link is already on your profile", // DRAFT COPY (contact duplicate, error table)
} as const
