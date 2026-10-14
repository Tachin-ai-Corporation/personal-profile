/**
 * The /auth launch strings. DRAFT COPY for PM review: the patient-vault
 * launch strings (D9), the tenant title and the config/disabled copy are not
 * quoted in EXPERIENCE.md. They are not part of `MESSAGE_CATALOG`, so they are
 * exempt from the voice test ("Success!" is patient-vault verbatim).
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
