/**
 * Shared read states (Story 7.1, F3-3 `StateFrame`): the `/account` load error
 * and no-access line, and the Profile Section load error with its plural
 * nouns ("Couldn't load phones · Retry"). The nouns are gathered per Section
 * in `SECTION_LOAD_NOUNS` (`./index.ts`).
 */
export const STATE_MESSAGES = {
  loadError: "Something went wrong while loading profile information",
  noAccess: "You don't have access to this in your current account",
  sectionLoadError: "Couldn't load {section}",
  loadNounPersonal: "personal information", // DRAFT COPY (epics Story 2.1 load error)
  loadNounPhone: "phones", // DRAFT COPY (EXPERIENCE.md V&T example noun; epics Story 3.1)
  loadNounEmail: "emails", // DRAFT COPY (epics Story 3.5 load error)
  loadNounSocial: "social links", // DRAFT COPY (epics Story 3.7 load error)
  loadNounAddresses: "addresses", // DRAFT COPY (epics Story 4.1 load error)
  loadNounInsurance: "insurance", // DRAFT COPY (epics Story 5.1 load error)
} as const
