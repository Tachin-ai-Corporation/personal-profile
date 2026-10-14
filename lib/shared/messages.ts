/**
 * =============================================================================
 * Copy catalog
 * =============================================================================
 *
 * Every user-facing string lives here (no copy in components). Strings quoted
 * in EXPERIENCE.md are final; the rest are marked `// DRAFT COPY` (or
 * `// ARCHITECTURE-ADDED COPY`) for PM review. Raw error codes, upstream text
 * and exception strings are never rendered — only the mapped copy below.
 * =============================================================================
 */

import type { Environment } from "./environments"

/** The `/api/token` error codes (Story 1.2, D9). */
export type LaunchErrorCode =
  | "LAUNCH_INVALID"
  | "LAUNCH_USED"
  | "LAUNCH_EXPIRED"
  | "WRONG_TENANT"
  | "LAUNCH_CONFIG"
  | "SERVICE_DISABLED"
  | "UNSUPPORTED_MEDIA"
  | "METHOD_NOT_ALLOWED"

// DRAFT COPY — not quoted in EXPERIENCE.md (PM review).
const LINK_EXPIRED = "This link has expired. Open Personal Profile again from 1health."
// DRAFT COPY — not quoted in EXPERIENCE.md (PM review).
const UNAVAILABLE = "Personal Profile is unavailable right now. Use your profile in 1health for now."

/**
 * The user-safe `message` every `/api/token` error body carries, chosen by
 * `errorCode` (Story 1.2). `/auth` shows it in the error Alert.
 */
export const LAUNCH_ERROR_MESSAGES: Readonly<Record<LaunchErrorCode, string>> = {
  LAUNCH_INVALID: LINK_EXPIRED,
  LAUNCH_USED: LINK_EXPIRED,
  LAUNCH_EXPIRED: LINK_EXPIRED,
  // Locked in EXPERIENCE.md (module-neutral tenant copy, AD-6, PA5).
  WRONG_TENANT: "This is available in your personal account. Switch to it in 1health and open it again.",
  LAUNCH_CONFIG: UNAVAILABLE,
  SERVICE_DISABLED: UNAVAILABLE,
  UNSUPPORTED_MEDIA: LINK_EXPIRED,
  METHOD_NOT_ALLOWED: LINK_EXPIRED,
}

/** The display name of each environment (EXPERIENCE.md "{Demo|Production}"). */
export const ENVIRONMENT_LABELS: Readonly<Record<Environment, string>> = {
  // Locked in EXPERIENCE.md.
  demo: "Demo",
  // Locked in EXPERIENCE.md.
  prod: "Production",
}

/** The `/auth` launch screen copy (Story 1.2, D9). Locked in EXPERIENCE.md unless marked. */
export const AUTH_COPY = {
  // Progress, attempt 1.
  authenticating: "Authenticating...",
  connectingTo: (env: Environment) => `Connecting to ${ENVIRONMENT_LABELS[env]} environment`,
  // Progress, attempt 2 and later.
  confirming: "Confirming your login...",
  confirmingBody: "This can take a moment. Please wait while we finish confirming your login.",
  // Success.
  success: "Success!",
  loadingApp: "Loading app...",
  // Error Alert.
  failedTitle: "Authentication Failed",
  failedFallback: "Unable to authenticate. Please return to 1health and try again.",
  connectionTitle: "Connection Error",
  connectionBody: "Unable to connect to the authentication service. Please check your connection and try again.",
  enterManually: "Enter LPL Manually",
  switchEnvironment: "Switch Environment",
  goTo1health: (env: Environment) => `Go to 1health (${ENVIRONMENT_LABELS[env]})`,
  // Manual entry card.
  manualTitle: "Authentication Required",
  manualDescription: (env: Environment) =>
    `Connected to ${ENVIRONMENT_LABELS[env]} environment. No launch payload detected.`,
  lplLabel: "Launch Payload (LPL)",
  lplPlaceholder: "Paste encrypted LPL here...",
  submit: "Submit",
  or: "Or",
  // Choose Environment card.
  chooseTitle: "Choose Environment",
  // DRAFT COPY — patient-vault text, not quoted in EXPERIENCE.md (PM review).
  chooseDescription: "Select which 1health environment to connect to.",
} as const

/** The kill-switch screen on `/` and `/auth` (Story 1.16). */
export const DISABLED_COPY = {
  // DRAFT COPY
  title: "Personal Profile is unavailable right now",
  // DRAFT COPY
  body: "Use your profile in 1health for now.",
  // DRAFT COPY
  action: "Go to 1health",
} as const

// ARCHITECTURE-ADDED COPY — PM review
/** Idle-logoff warning copy (AD-16, Story 1.6). */
export const IDLE_COPY = {
  title: "You'll be signed out in 1 minute",
  stay: "Stay signed in",
} as const

/** Session-expired dialog copy (FR-2, AD-19, Story 1.7). */
export const SESSION_EXPIRED_COPY = {
  // Locked in EXPERIENCE.md.
  title: "Your session ended",
  // Locked in EXPERIENCE.md.
  body: "Your changes are kept on this device. Relaunch from 1health to continue.",
  // Locked in EXPERIENCE.md.
  action: "Return to 1health",
} as const

/** Session-changed dialog copy (AD-19, Story 1.7). */
export const SESSION_CHANGED_COPY = {
  // ARCHITECTURE-ADDED COPY — PM review
  title: "This profile was opened by another account in another tab",
  // ARCHITECTURE-ADDED COPY — PM review
  reload: "Reload",
} as const

/** Profile page shell copy: app bar, tabs, Section navigation (Story 1.8). */
export const SHELL_COPY = {
  // DRAFT COPY
  appTitle: "Personal Profile",
  // DRAFT COPY — the header slot's region name (Story 1.9 fills it).
  profileRegion: "Profile",
  // Locked in EXPERIENCE.md.
  returnToPortal: "Return to 1health",
  // Locked in EXPERIENCE.md.
  tabs: { contacts: "Contacts", insurance: "Insurance", medical: "Medical" },
  // DRAFT COPY
  comingSoon: "Coming soon",
  // DRAFT COPY
  soon: "Soon",
  // Locked in EXPERIENCE.md.
  jumpTo: "Jump to",
  // DRAFT COPY
  sectionsNav: "Sections",
  // Locked in EXPERIENCE.md.
  sections: {
    personal: "Personal information",
    phone: "Phone",
    email: "Email",
    social: "Social media",
    addresses: "Addresses",
  },
  // DRAFT COPY — column headers from DESIGN.md "Section table — read".
  columns: {
    phone: ["Number", "Label", "Type", "Status", "Notifications"],
    email: ["Email address", "Label", "Status", "Notifications"],
    social: ["Link"],
    addresses: ["Address", "Label", "Type", "Status"],
  },
  // DRAFT COPY
  signature: "Signature",
  // DRAFT COPY
  insurance: "Insurance",
  // Locked (RC9).
  medical: "Coming soon: your medical information will appear here.",
  // Locked in EXPERIENCE.md: "Couldn't load {section} · Retry".
  loadError: (section: string) => `Couldn't load ${section.toLowerCase()}`,
  // DRAFT COPY
  retry: "Retry",
} as const
