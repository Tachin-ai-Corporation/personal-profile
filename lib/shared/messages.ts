/**
 * User-facing copy (AD-11): the one message catalog. Components never inline
 * user-facing strings.
 *
 * - `LAUNCH_*`: the /auth launch strings. DRAFT COPY for PM review: the
 *   patient-vault launch strings (D9), the tenant title and the config/disabled
 *   copy are not quoted in EXPERIENCE.md. They are exempt from the voice test
 *   ("Success!" is patient-vault verbatim).
 * - Everything from `COMMON_MESSAGES` on: verbatim from the EXPERIENCE.md Voice
 *   and Tone table, unless the line carries a `// DRAFT COPY` marker
 *   (`messages.test.ts` enforces both, plus the voice rules).
 * - `{Name}` placeholders are filled with `formatMessage()`.
 */

export const LAUNCH_MESSAGES = {
  authenticatingTitle: "Authenticating...",
  connectingTo: (label: string): string => `Connecting to ${label} environment`,
  confirmingTitle: "Confirming your login...",
  confirmingBody: "This can take a moment. Please wait while we finish confirming your login.",
  successTitle: "Success!",
  successBody: "Loading app...",
  failedTitle: "Authentication Failed",
  failedFallback: "Unable to authenticate. Please return to 1health and try again.",
  connectionTitle: "Connection Error",
  connectionBody: "Unable to connect to the authentication service. Please check your connection and try again.",
  enterManually: "Enter LPL Manually",
  switchEnvironment: "Switch Environment",
  goTo1health: (label: string): string => `Go to 1health (${label})`,
  manualTitle: "Authentication Required",
  manualDescription: (label: string): string => `Connected to ${label} environment. No launch payload detected.`,
  lplLabel: "Launch Payload (LPL)",
  lplPlaceholder: "Paste encrypted LPL here...",
  submit: "Submit",
  or: "Or",
  chooseTitle: "Choose Environment",
  chooseDescription: "Select which 1health environment to connect to.",
  initializing: "Initializing...",
} as const

/** User-safe `message` of `/api/token` error bodies, by error code (D9). Never upstream text. */
export const LAUNCH_ERROR_MESSAGES = {
  expired: "This link has expired. Open Personal Profile again from 1health.",
  wrongTenant: "This is available in your personal account. Switch to it in 1health and open it again.",
  unavailable: "Personal Profile is unavailable right now. Use your profile in 1health for now.",
} as const

/** Fills each `{Name}` placeholder of a catalog template; unknown names stay as written. */
export function formatMessage(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  )
}

// --- App catalog (verbatim unless marked `// DRAFT COPY`) --------------------

/** Actions and values shared by several surfaces. */
export const COMMON_MESSAGES = {
  cancel: "Cancel",
  save: "Save",
  retry: "Retry",
  notProvided: "Not provided",
} as const

/** App bar, page nav and tab labels (Story 1.8, Story 7.1). */
export const SHELL_MESSAGES = {
  wordmark: "1health", // DRAFT COPY (brand wordmark)
  pagesNavLabel: "Pages", // DRAFT COPY (nav landmark name, epics Story 1.8)
  pageProfile: "Personal Profile",
  pageAccount: "Account", // DRAFT COPY (epics Story 1.8)
  returnTo1health: "Return to 1health",
  profileTabContacts: "Contacts", // DRAFT COPY (DESIGN.md tabs)
  profileTabInsurance: "Insurance", // DRAFT COPY (DESIGN.md tabs)
  profileTabMedical: "Medical", // DRAFT COPY (DESIGN.md tabs)
  comingSoon: "Coming soon", // DRAFT COPY (DESIGN.md tag-coming-soon)
  comingSoonShort: "Soon", // DRAFT COPY (DESIGN.md mobile tag)
  medicalComingSoon: "Coming soon: medications, allergies and conditions will appear here",
  tabPlaceholder: "This tab is on its way.", // DRAFT COPY (7.0b-2 placeholder panel until Epics 3–5)
  accountTabPersonal: "Personal Account", // DRAFT COPY (DESIGN.md /account tabs)
  accountTabProvider: "Individual Provider Registration", // DRAFT COPY (DESIGN.md /account tabs)
  accountTabOrganizations: "My Organizations", // DRAFT COPY (DESIGN.md /account tabs)
  accountSectionHeading: "Personal account settings",
  authenticatorHeading: "Authenticator app", // DRAFT COPY (epics Story 7.1 h2)
} as const

/** Section framework copy (Stories 1.11, 1.12). */
export const SECTION_MESSAGES = {
  edit: "Edit", // DRAFT COPY (EXPERIENCE.md Section header)
  editing: "Editing", // DRAFT COPY (epic 7 edit view label)
  saving: "Saving…", // DRAFT COPY (EXPERIENCE.md Saving state)
  unsavedChanges: "Unsaved changes",
  saved: "{section} saved.",
  networkFailure: "Couldn't save {section}. Check your connection.",
} as const

/** Shared read states on `/account` (Story 7.1). */
export const STATE_MESSAGES = {
  loadError: "Something went wrong while loading profile information",
  noAccess: "You don't have access to this in your current account",
} as const

/** The profile header (Story 1.9). */
export const HEADER_MESSAGES = {
  loading: "Loading your profile", // DRAFT COPY (skeleton accessible name)
  primaryPhone: "Primary phone", // DRAFT COPY (header meta label)
  primaryEmail: "Primary email", // DRAFT COPY (header meta label)
} as const

/** The leave guard (Story 1.13); its Save button is `COMMON_MESSAGES.save`. */
export const LEAVE_GUARD_MESSAGES = {
  title: "You have unsaved changes",
  keepEditing: "Keep editing",
  discard: "Discard",
  body: "Save your changes before you leave, or discard them.", // DRAFT COPY (Story 1.13 body)
  bodyCannotSave: "These changes can't be saved from here. Keep editing to finish them, or discard them.", // DRAFT COPY (Story 1.13 canSave:false)
} as const

/** The session-expired dialog (Story 1.7); its action is `SHELL_MESSAGES.returnTo1health`. */
export const SESSION_EXPIRED_MESSAGES = {
  title: "Your session ended",
  body: "Your changes are kept on this device. Relaunch from 1health to continue.",
} as const

/** The idle warning (Story 1.6, EXPERIENCE.md automatic logoff). */
export const IDLE_MESSAGES = {
  title: "You'll be signed out in 1 minute", // DRAFT COPY (architecture-added idle warning, PM review)
  stay: "Stay signed in", // DRAFT COPY (architecture-added idle warning, PM review)
  staying: "Keeping you signed in…", // DRAFT COPY (screen-reader status while "Stay signed in" is pending)
} as const

/** Every app-catalog group (not the launch strings), for the catalog tests. */
export const MESSAGE_CATALOG = {
  common: COMMON_MESSAGES,
  shell: SHELL_MESSAGES,
  section: SECTION_MESSAGES,
  state: STATE_MESSAGES,
  header: HEADER_MESSAGES,
  leaveGuard: LEAVE_GUARD_MESSAGES,
  sessionExpired: SESSION_EXPIRED_MESSAGES,
  idle: IDLE_MESSAGES,
} as const
