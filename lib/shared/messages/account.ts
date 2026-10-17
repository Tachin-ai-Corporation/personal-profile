/** `/account` copy needed by the shared error tables (`lib/api/errors/account.ts`); Epic 7 adds the rest. */
export const ACCOUNT_MESSAGES = {
  primaryEmailInUse: "This email is already used by another account", // DRAFT COPY (email in use on PUT user/edit)
  username: "Username", // DRAFT COPY (Story 7.4 field label)
  password: "Password", // DRAFT COPY (Story 7.4 field label)
  primaryEmail: "Primary email address", // DRAFT COPY (Story 7.4 field label)
  primaryPhone: "Primary phone number", // DRAFT COPY (Story 7.4 field label)
  preferredLanguage: "Preferred language", // DRAFT COPY (Story 7.4 field label)
  timeZone: "Default time zone", // DRAFT COPY (Story 7.4 field label)
  locale: "Preferred locale for date, time, and currency", // DRAFT COPY (Story 7.4 field label)
  english: "English", // DRAFT COPY (approved regional option label)
  localeEnglishUS: "English - United States", // DRAFT COPY (approved regional option label)
  zoneHawaiian: "Hawaiian", // DRAFT COPY (approved time-zone label)
  zoneAlaska: "Alaska", // DRAFT COPY (approved time-zone label)
  zonePacific: "Pacific", // DRAFT COPY (approved time-zone label)
  zoneMountain: "Mountain", // DRAFT COPY (approved time-zone label)
  zoneCentral: "Central", // DRAFT COPY (approved time-zone label)
  zoneEastern: "Eastern", // DRAFT COPY (approved time-zone label)
} as const
