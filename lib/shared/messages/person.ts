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
  // Personal information edit view (Team A, Story 2.2). Gender identity help is COMBOBOX_MESSAGES.genderIdentityHelp;
  // the Birth date help is `ageRange`.
  otherNamesHelp: "Former or other legal names.",
  /** Sexual orientation: the help line and its length error. */
  sexualOrientationHelp: "Up to 128 characters.",
  /** Race, Ethnicity, Biological gender and Gender identity left empty. */
  chooseValue: "Choose a value", // DRAFT COPY (epics Story 2.2)
  /** Every person text field with a control character, emoji or other non-printable character. */
  notPrintable: "Use letters, spaces and standard punctuation only", // DRAFT COPY (epics Story 2.2)
  /** City of birth and Gender identity over 128 characters. */
  shortTextTooLong: "Up to 128 characters", // DRAFT COPY (epics Story 2.2, City of birth)
  /** Middle name, Other names and Titles over 24 characters. */
  nameTooLong: "Up to 24 characters", // DRAFT COPY (Story 2.2 spec)
  /** Name prefix and Name suffix over 10 characters. */
  prefixSuffixTooLong: "Up to 10 characters", // DRAFT COPY (Story 2.2 spec)
  // SSN entry and Reveal (Team A, Story 2.3). The label is `ssn`; SSN taken is `ssnTaken`.
  /** The Reveal button's visible text (its accessible name is `ssnRevealName`). */
  ssnReveal: "Reveal",
  /** The Hide button's visible text (its accessible name is `ssnHideName`). */
  ssnHide: "Hide",
  /** Reduced motion: replaces the countdown ring. */
  ssnHidesIn: "Hides in 30 s",
  ssnRevealName: "Reveal SSN", // DRAFT COPY (Story 2.3 spec Q2: the AC's name)
  ssnHideName: "Hide SSN", // DRAFT COPY (Story 2.3 spec Q2)
  /** The polite announcement on Reveal. */
  ssnShown: "Social Security number shown, hides in 30 seconds", // DRAFT COPY (verbatim from EXPERIENCE.md accessibility notes, not the V&T table)
  /** Screen-reader text for the visible (aria-hidden) mask; `{last4}` is the mask's digits. */
  ssnEndingIn: "SSN ending in {last4}", // DRAFT COPY (Story 2.3 spec Q1)
  /** Edit help while the saved mask shows. */
  ssnHelpMasked: "Type a new number to replace it.",
  /** Edit help while the SSN is revealed. */
  ssnHelpRevealed: "Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN.",
  /** A failed Reveal (polite, under the SSN; not a field error). */
  ssnRevealFailed: "Couldn't show your SSN. Try again.", // DRAFT COPY (Story 2.3 spec)
  /** A partial SSN on blur or Save. */
  ssnIncomplete: "Enter all 9 digits of your SSN", // DRAFT COPY (Story 2.3 spec)
  /** The empty SSN input's placeholder (1health-fe PersonalInformationForm.tsx:442-445; the other fields' placeholders are their labels). */
  ssnPlaceholder: "Social Security number", // DRAFT COPY (1health-fe placeholder, sentence case)
  // Signature (Team A, Story 2.4). The row label is SHELL_MESSAGES.signature; "Clear" and "Cancel" are COMMON_MESSAGES.
  /** The pad's cue while empty, and the canvas's accessible name. */
  signatureCue: "Draw your signature",
  /** The ghost button that opens the file picker. */
  signatureUpload: "Upload image instead",
  /** The help line under the pad ("Saved {date}." is left out: no file date exists). */
  signatureHelp: "Draw with a mouse, finger or pen, or upload a PNG or JPEG.", // DRAFT COPY (EXPERIENCE.md V&T "Signature help (edit)" without "Saved {date}.")
  /** Visually hidden, part of the canvas's description. */
  signatureKeyboard: "Drawing needs a mouse, finger or pen. To add your signature with a keyboard, use Upload image instead.", // DRAFT COPY (epics Story 2.4)
  /** An upload that isn't a PNG or JPEG (MIME type and leading bytes). */
  signatureWrongType: "Choose a PNG or JPEG image.", // DRAFT COPY (epics Story 2.4)
  /** An upload the re-encode can't bring to 1 MB or decode. */
  signatureTooLarge: "This image is too large. Choose a smaller one.", // DRAFT COPY (epics Story 2.4)
  /** The Remove confirm (EXPERIENCE.md V&T "Remove Signature confirm"). */
  signatureRemoveTitle: "Remove your signature?",
  signatureRemoveBody: "Documents you sign will no longer carry it.",
  signatureRemoveConfirm: "Remove signature",
  /** The Signature step failed (after the other fields saved, or alone). */
  signatureSaveFailed: "Couldn't save your signature. Try again.", // DRAFT COPY (epics Story 2.4)
} as const
