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
} as const
