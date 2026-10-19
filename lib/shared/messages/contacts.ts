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
  // Phone verify (Story 3.3).
  verifyCountdown: "Link sent · Resend in {n} s", // verbatim: EXPERIENCE.md Voice and Tone, "Verify pending"
  verifyLinkSent: "Link sent", // verbatim: EXPERIENCE.md Voice and Tone, "Verify pending" (announced once per send)
  verifySendFailed: "Couldn't send the link", // DRAFT COPY (epics Story 3.3 send error row help)
  verifyNetwork: "Couldn't send the link. Check your connection.", // DRAFT COPY (epics Story 3.3 manual send network toast)
  verifyCooldown: "A link was already sent in the last hour. Check your texts.", // DRAFT COPY (spec 3.3 backend 60-minute cooldown)
  // Phone Make primary and notifications (Story 3.4).
  phoneVerifyFirst: "Verify this number first", // verbatim: EXPERIENCE.md Voice and Tone, "Disabled Make primary (unverified)"
  phoneLandlineNotPrimary: "Landlines can't be primary", // verbatim: EXPERIENCE.md Voice and Tone, "Disabled Make primary (landline)"
  phoneHomeNotPrimary: "Change the label from Home, then verify this number", // DRAFT COPY (epics Story 3.4 unverified Home-labelled Mobile)
  phonePrimaryFootnote: "Changing your primary phone changes how you sign in.", // verbatim: EXPERIENCE.md Voice and Tone, "Phone footnote"
  makePrimaryTitle: "This changes how you sign in", // verbatim: EXPERIENCE.md Voice and Tone, "Primary change confirm"
  makePrimaryBody: "{number} becomes your primary phone and sign-in number. Your current primary is relabeled Old.", // verbatim: EXPERIENCE.md Voice and Tone, "Primary change confirm"
  makePrimaryBodyNoCurrent: "{number} becomes your primary phone and sign-in number.", // DRAFT COPY (epics Story 3.4 body with no current Primary, RC2)
  notificationsFor: "Notifications for {number}", // DRAFT COPY (epics Story 3.4 the Primary row's switch name)
  notificationsDraftOn: "Notifications on", // DRAFT COPY (spec 3.4 draft compare of the Primary row)
  notificationsDraftOff: "Notifications off", // DRAFT COPY (spec 3.4 draft compare of the Primary row)
  // The backend's Primary rules (spec 3.4; "delete" reuses `phonePrimaryFirst`, "not verified" `phoneVerifyFirst`).
  phonePrimaryDowngrade: "Make another phone primary before you change this one's label", // DRAFT COPY (spec 3.4 downgrade without a replacement)
  phonePrimaryOneReplacement: "Only one phone can replace your primary phone", // DRAFT COPY (spec 3.4 more than one replacement)
  phonePrimaryOnePerType: "Only one phone can be primary", // DRAFT COPY (spec 3.4 one Primary per type in a request)
  phonePrimaryNotNew: "A new phone can't be primary. Save it, then make it primary.", // DRAFT COPY (spec 3.4 Primary in an add)
  phonePrimaryChanged: "Your primary phone changed. Check your phones and try again.", // DRAFT COPY (spec 3.4 the person already has a Primary)
} as const
