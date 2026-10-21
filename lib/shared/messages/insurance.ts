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
  primaryTaken: "You already have a primary policy of this type", // DRAFT COPY (spec 5.2 backend one Primary per type; after Story 5.4 only a race reaches it)
  policyMissing: "This policy is no longer on your profile.", // DRAFT COPY (spec 5.2 backend "does not have an insurance", error toast)
  subscriberIncomplete: "The saved policyholder is incomplete. To change the policyholder, remove this policy and add it again.", // DRAFT COPY (spec 5.2 review: a backend subscriber rule on a locked subscriber)
  // Story 5.3: the editor's card image slots ("Replace" / "Remove" are `COMMON_MESSAGES`), the uploads and "Retry upload".
  cardImages: "Card images", // DRAFT COPY (spec 5.3 editor group heading)
  cardImagesRules: "PNG or JPEG, up to 10 MB. Images upload after the policy saves.", // verbatim: EXPERIENCE.md Voice and Tone, "Card images"
  noImageChosen: "No image chosen", // verbatim: EXPERIENCE.md Voice and Tone, "Card images"
  chooseImage: "Choose {side} image", // verbatim: EXPERIENCE.md Voice and Tone, "Card images" ("Choose back image")
  replaceImage: "Replace {side} image", // DRAFT COPY (spec 5.3 slot Replace, accessible name)
  removeImage: "Remove {side} image", // DRAFT COPY (spec 5.3 slot Remove, accessible name)
  chosenImageAlt: "Chosen {side} image", // DRAFT COPY (spec 5.3 slot preview of a chosen file)
  chosenFileKb: "{fileName} · {size} KB", // DRAFT COPY (spec 5.3 slot "{file name} · {size}", under 1 MB)
  chosenFileMb: "{fileName} · {size} MB", // DRAFT COPY (spec 5.3 slot "{file name} · {size}", one decimal)
  cardWrongType: "{fileName} isn't a PNG or JPEG image.", // DRAFT COPY (spec 5.3 type check)
  cardTooLarge: "{fileName} is {size} MB. Choose a file up to 10 MB.", // DRAFT COPY (spec 5.3 size check, one decimal)
  cardTooManyPixels: "{fileName} is larger than 6000 × 4000 pixels.", // DRAFT COPY (spec 5.3 dimension check)
  imageNotUploaded: "{side} image not uploaded.", // DRAFT COPY (spec 5.3 partial toast "Insurance saved. Back image not uploaded.", and a failed Retry)
  imagesNotUploaded: "Card images not uploaded.", // DRAFT COPY (spec 5.3 partial toast "Insurance saved. Card images not uploaded.")
  retryUpload: "Retry upload", // verbatim: EXPERIENCE.md Voice and Tone, "Card image failed"
  retryUploadName: "Retry upload of the {side} image", // DRAFT COPY (spec 5.3 card "Retry upload", accessible name)
  imageUploaded: "Card image uploaded.", // DRAFT COPY (spec 5.3 Retry success toast)
  // Story 5.4: one Primary per type, the demotion offer ({insurer} may name several, joined with `insurerList`).
  primaryConflict: "Only one primary {Type} policy. Make {insurer} secondary?", // verbatim: EXPERIENCE.md Voice and Tone, "Primary policy demotion"
  makeSecondary: "Make {insurer} secondary", // verbatim: EXPERIENCE.md Voice and Tone, "Primary policy demotion" (button)
  demotionNote: "The change saves with this policy.", // verbatim: EXPERIENCE.md Voice and Tone, "Primary policy demotion" (note)
  insurerList: "{insurers} and {last}", // DRAFT COPY (spec 5.4 several insurers: "Aetna and Cigna", "Aetna, Cigna and Humana")
  insurerListSeparator: ", ", // DRAFT COPY (spec 5.4 between the insurers before the last: "Aetna, Cigna and Humana")
  primaryConflictUnaccepted: "Only one primary {Type} policy is allowed. Make {insurer} secondary, or don't make this policy primary.", // DRAFT COPY (spec 5.4 Save without the acceptance; "choose another precedence" reworded: the catalog keeps "precedence" out of sentences)
  demotionUnbuildable: "Couldn't make {insurer} secondary. Edit that policy first.", // DRAFT COPY (spec 5.4 the other policy's saved values can't be sent)
  demotionNotRolledBack: "{insurer} is now secondary.", // DRAFT COPY (spec 5.4 decision 2A: a rollback that failed; also after "Insurance saved." when a demotion ran)
  demotionNoPolicyholder: "Couldn't make {insurer} secondary: its policyholder is missing. Remove that policy and add it again.", // DRAFT COPY (spec 5.4 review: a non-Self policy without a saved subscriber)
  demotionPolicyGone: "{insurer} is no longer on your profile. Save again.", // DRAFT COPY (spec 5.4 review: the other policy went before its demotion)
  // Story 5.5: delete a policy ("Delete" is `COMMON_MESSAGES.delete`; {policy} is "{Insurer} {Type} Insurance", `policyName`).
  deleteTitle: "Delete this insurance policy?", // verbatim: EXPERIENCE.md Voice and Tone, "Delete insurance confirm"
  deleteBody: "{policy} will be removed from your profile.", // verbatim: EXPERIENCE.md Voice and Tone, "Delete insurance confirm"
  deleteConfirm: "Delete policy", // verbatim: EXPERIENCE.md Voice and Tone, "Delete insurance confirm"
  deleting: "Deleting…", // DRAFT COPY (spec 5.5 busy confirm, and the reason "Delete" is unavailable while that delete runs)
  policyDeleted: "Insurance policy deleted.", // DRAFT COPY (epics Story 5.5 success toast)
  deleteNetworkFailure: "Couldn't delete insurance policy. Check your connection.", // DRAFT COPY (epics Story 5.5 network failure toast)
  deleteFailed: "Couldn't delete insurance policy.", // DRAFT COPY (spec 5.5 other failures toast)
  policyAlreadyRemoved: "This policy was already removed.", // DRAFT COPY (spec 5.5 decision 1B: the backend's "already gone" answers)
} as const
