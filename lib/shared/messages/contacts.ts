/** Contacts copy needed by the shared error tables (`lib/api/errors/contacts.ts`); Epic 3 adds the rest. */
export const CONTACT_MESSAGES = {
  duplicatePhone: "This number is already on your profile",
  duplicateEmail: "This email is already on your profile", // DRAFT COPY (contact duplicate, error table)
  duplicateSocial: "This link is already on your profile", // DRAFT COPY (contact duplicate, error table)
} as const
