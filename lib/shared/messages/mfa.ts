/** Authenticator app (Epic 8). Heading copy lives in SHELL_MESSAGES. */
export const MFA_MESSAGES = {
  intro: "Link an authenticator app to get sign-in codes on your phone.",
  enabled: "Enabled",
  notSetUp: "Not set up",
  inactiveReason: "Disable the current authenticator to link another",
  disable: "Disable", // DRAFT COPY: action label specified by Story 8.1.
  linkApp: "Link {App}", // DRAFT COPY: accessible action label specified by Story 8.1.
  google: "Google", // DRAFT COPY: vendor name.
  microsoft: "Microsoft", // DRAFT COPY: vendor name.
  authy: "Authy", // DRAFT COPY: vendor name.
  duo: "DUO", // DRAFT COPY: vendor name.
  androidOtp: "Android OTP", // DRAFT COPY: vendor name.
} as const
