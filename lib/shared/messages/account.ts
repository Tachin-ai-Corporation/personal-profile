/** `/account` copy needed by the shared error tables (`lib/api/errors/account.ts`); Epic 7 adds the rest. */
export const ACCOUNT_MESSAGES = {
  emailInvalid: "Invalid email address", // DRAFT COPY
  phoneRequired: "Primary phone is required", // DRAFT COPY
  primaryUnavailable: "Select a current verified contact", // DRAFT COPY
  emailHelper: "Please add additional verified email(s) in your personal profile to change your current primary contact email", // DRAFT COPY
  phoneHelper: "Please add additional verified phone(s) in your personal profile to change your current primary contact phone", // DRAFT COPY
  personalProfile: "personal profile", // DRAFT COPY
  emailNotice: "Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email.", // DRAFT COPY
  phoneNotice: "Changing your primary phone will result in updating your notification preferences.", // DRAFT COPY
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
  usernameHelp: "Your username can't be changed here.", // DRAFT COPY
  passwordHelp: "Password changes aren't available here.", // DRAFT COPY
  aboutBirthDate: "About birth date", // DRAFT COPY
  birthDateHelp: "Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18.", // DRAFT COPY
  selectValue: "Select a value", // DRAFT COPY
  languageRequired: "Select a preferred language", // DRAFT COPY
  timeZoneRequired: "Select a time zone", // DRAFT COPY
  localeRequired: "Select a locale", // DRAFT COPY
  updated: "Personal account updated successfully", // DRAFT COPY
  detailsPart: "Account details", // DRAFT COPY
  timeZonePart: "Time zone", // DRAFT COPY
  localePart: "Preferred locale", // DRAFT COPY
  partFailed: "{part} was not saved.", // DRAFT COPY
} as const
