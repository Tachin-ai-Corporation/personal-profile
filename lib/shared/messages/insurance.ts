/**
 * Insurance (Epic 5) copy; its stories add the strings. The Section title is
 * `SHELL_MESSAGES.profileTabInsurance` ("Insurance"), the "Back" caption
 * `COMMON_MESSAGES.back` and the Primary chip `COMMON_MESSAGES.primary`
 * (the catalog holds each string once). Type and precedence names are the
 * platform's enum names shown in title case (`MEDICAL` → "Medical"), not copy.
 */
export const INSURANCE_MESSAGES = {
  // Story 5.1: the policy cards.
  policyTitle: "{type} Insurance", // DRAFT COPY (epics Story 5.1 card title "{Type} Insurance")
  policyName: "{insurer} {policy}", // DRAFT COPY (EXPERIENCE.md "{Insurer} {Type} Insurance": kebab and viewer names)
  insurer: "Insurer", // DRAFT COPY (epics Story 5.1 key/value grid)
  subscriber: "Subscriber", // verbatim: EXPERIENCE.md Voice and Tone, "Subscriber" (heading)
  memberId: "Member ID", // DRAFT COPY (epics Story 5.1 key/value grid)
  effective: "Effective", // DRAFT COPY (epics Story 5.1 key/value grid)
  groupId: "Group ID", // DRAFT COPY (epics Story 5.1 key/value grid)
  expiration: "Expiration", // DRAFT COPY (epics Story 5.1 key/value grid)
  cancellation: "Cancellation", // DRAFT COPY (epics Story 5.1 key/value grid)
  deleted: "Deleted", // DRAFT COPY (EXPERIENCE.md "Deleted insurance" chip)
  emptyMessage: "No insurance on file. Add a policy before your next visit.", // verbatim: EXPERIENCE.md Voice and Tone, "Empty Insurance"
  addInsurance: "Add insurance", // verbatim: EXPERIENCE.md Voice and Tone, "Empty Insurance" (Story 5.2 opens the editor)
  // Card images (Story 5.1 thumbnails and viewer).
  front: "Front", // DRAFT COPY (epics Story 5.1 thumbnail caption)
  imageMissing: "Image not uploaded", // verbatim: EXPERIENCE.md Voice and Tone, "Card image failed"
  imageMissingName: "{side} image not uploaded", // DRAFT COPY (mockup key-insurance.html tile name "Back image not uploaded")
  imageAlt: "{side} of {policy} card", // DRAFT COPY (card image name, e.g. "Front of Medical Insurance card")
  viewerTitle: "{policy} card", // DRAFT COPY (epics Story 5.1 card image viewer title)
  viewerSides: "Card side", // DRAFT COPY (the viewer's Front/Back toggle group name)
  // Story 5.2: the editor drawer. Its "Add insurance" title is `addInsurance`; "Type" is `SHELL_MESSAGES.columnType`;
  // the subscriber's labels are `FIELD_MESSAGES` and `SHELL_MESSAGES.sectionEmail` / `sectionPhone`.
  editTitle: "Edit insurance", // DRAFT COPY (epics Story 5.2 drawer title)
  precedence: "Precedence", // DRAFT COPY (epics Story 5.2 field label)
  relationship: "Relationship", // DRAFT COPY (epics Story 5.2 field label)
  effectiveDate: "Effective date", // DRAFT COPY (epics Story 5.2 field label)
  expirationDate: "Expiration date", // DRAFT COPY (epics Story 5.2 field label, "(optional)")
  cancellationDate: "Cancellation date", // DRAFT COPY (epics Story 5.2 field label, "(optional)")
  datesHelp: "Expiration and cancellation must be after the effective date. Cancellation must be before expiration.", // verbatim: EXPERIENCE.md Voice and Tone, "Insurance dates help"
  subscriberIntro: "The person who holds this policy. Needed because the relationship isn't Self.", // verbatim: EXPERIENCE.md Voice and Tone, "Subscriber"
  subscriberEmailHelp: "Use {name}'s email, not the one you sign in with.", // verbatim: EXPERIENCE.md Voice and Tone, "Subscriber" (email help)
  subscriberEmailHelpNoName: "Use their email, not the one you sign in with.", // DRAFT COPY (spec 5.2 email help before a first name is typed)
  subscriberInvite: "If {name} isn't on 1health yet, we'll invite them by email.", // DRAFT COPY (spec 5.2 decision 2C invite line)
  subscriberInviteNoName: "If they aren't on 1health yet, we'll invite them by email.", // DRAFT COPY (spec 5.2 invite line before a first name is typed)
  subscriberLocked: "To change the policyholder, remove this policy and add it again.", // DRAFT COPY (spec 5.2 decision 2C locked subscriber)
  optionsLoadError: "Couldn't load the insurance options.", // DRAFT COPY (spec 5.2 type key failure, with Retry)
  // Story 5.2 validation (client rules and the mapped backend rules, `lib/api/errors/insurance.ts`).
  insurerRequired: "Choose your insurer", // DRAFT COPY (spec 5.2 required Insurer)
  insurerMissing: "This insurer is no longer listed. Search again.", // DRAFT COPY (spec 5.2 backend: unknown insurance company id)
  memberIdRequired: "Member ID is required", // DRAFT COPY (spec 5.2 required Member ID)
  memberIdLength: "Member ID must be 3 to 32 characters", // DRAFT COPY (spec 5.2 Member ID length)
  groupIdLength: "Group ID must be 3 to 32 characters", // DRAFT COPY (spec 5.2 Group ID length)
  effectiveRequired: "Effective date is required", // DRAFT COPY (spec 5.2 required Effective date)
  expirationAfterEffective: "Expiration must be after the effective date", // DRAFT COPY (spec 5.2 date order)
  cancellationAfterEffective: "Cancellation must be after the effective date", // DRAFT COPY (spec 5.2 date order)
  cancellationBeforeExpiration: "Cancellation must be before expiration", // DRAFT COPY (spec 5.2 date order)
  subscriberEmailRequired: "Email is required", // DRAFT COPY (spec 5.2 required subscriber email)
  subscriberEmailOwn: "Use the subscriber's email, not yours", // DRAFT COPY (spec 5.2 subscriber email equals the user's own)
  subscriberPhoneRequired: "Phone is required", // DRAFT COPY (spec 5.2 required subscriber phone)
  subscriberAge: "You must be 18 to 120 years old", // verbatim: EXPERIENCE.md Voice and Tone, "Validation"
  duplicatePolicy: "This policy is already on your profile", // DRAFT COPY (spec 5.2 backend duplicate on POST / PUT)
  primaryTaken: "You already have a primary policy of this type", // DRAFT COPY (spec 5.2 backend one Primary per type, until Story 5.4)
  policyMissing: "This policy is no longer on your profile.", // DRAFT COPY (spec 5.2 backend "does not have an insurance", error toast)
  subscriberIncomplete: "The saved policyholder is incomplete. To change the policyholder, remove this policy and add it again.", // DRAFT COPY (spec 5.2 review: a backend subscriber rule on a locked subscriber)
} as const
