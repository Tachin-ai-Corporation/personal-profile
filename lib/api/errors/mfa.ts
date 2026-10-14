import type { MessageRule } from "./core"

/** The authenticator card names no field: its cases are `coded`. */
export type Field = never

/** Authenticator app (Epic 8): the exact `MfaServiceImpl` messages (an `IllegalStateException`, 4xx). */
export const rules: readonly MessageRule<Field>[] = [
  { scopes: ["authenticator"], pattern: /^Mfa is not enabled for this user\.$/, result: { kind: "coded", code: "MFA_NOT_ENABLED" } },
  { scopes: ["authenticator"], pattern: /^Mfa config is missing\.$/, result: { kind: "coded", code: "MFA_NOT_ENABLED" } },
  { scopes: ["authenticator"], pattern: /^Totp is already enabled\.$/, result: { kind: "coded", code: "TOTP_ALREADY_ENABLED" } },
]
