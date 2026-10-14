/**
 * Person rules copy shared by Personal information and Account settings (PA4,
 * Profile addendum §D, AD-11). The rules themselves live in
 * `lib/shared/person-rules.ts`. `ageRange` takes `{min}` and `{max}` from
 * `birthDateAgeRange(roles)`.
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
} as const
