/**
 * Person rules copy shared by Personal information and Account settings (PA4,
 * Profile addendum §D, AD-11). The rules themselves live in
 * `lib/shared/person-rules.ts`. `ageRange` takes `{min}` and `{max}` from
 * `birthDateAgeRange(roles)`. The field labels both pages show are in
 * `fields.ts` (`FIELD_MESSAGES`, foundation-owned).
 */
export const PERSON_MESSAGES = {
  firstNameRequired: "First name is required",
  lastNameRequired: "Last name is required",
  firstNameTooLong: "First name can be up to 24 characters",
  lastNameTooLong: "Last name can be up to 24 characters",
  birthDateRequired: "Birth date is required",
  birthDateFormat: "Enter a date as MM/DD/YYYY",
  ageRange: "You must be between {min} and {max} years old",
  ssnTaken: "This SSN belongs to another person",
  // Personal information field labels (Team A, Story 2.1; EXPERIENCE.md Key/value table field order).
  // First, middle and last name and birth date are FIELD_MESSAGES; Signature is SHELL_MESSAGES.signature.
  namePrefix: "Name prefix", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  nameSuffix: "Name suffix", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  otherNames: "Other names", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  titles: "Titles", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  cityOfBirth: "City of birth", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  race: "Race", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  ethnicity: "Ethnicity", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  biologicalGender: "Biological gender", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  genderIdentity: "Gender identity", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  sexualOrientation: "Sexual orientation", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
  ssn: "SSN", // DRAFT COPY (epics Story 2.1 F1 order; not in the V&T table)
} as const
