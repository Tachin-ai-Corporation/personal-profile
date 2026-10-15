/**
 * Product constants of the Profile module (`/account`, AD-23), kept in one
 * place so no feature hard-codes them. This is the only file outside
 * `lib/shared/environments.ts` that `scripts/check-forbidden.sh` lets name a
 * 1health.io URL.
 */

/**
 * "Register organization" for external users (Story 10.1, FR119, PA1): opens
 * in a new tab (`target="_blank" rel="noopener noreferrer"`, the AD-5
 * exception). The same URL on demo and prod.
 */
export const CHECKOUT_URL = "https://learnmore.1health.io/product-checkout"

/**
 * Login-email suffixes of internal users (Story 10.1, AD-23): they get the
 * Portal hand-off to organization creation and "Create new organization"
 * instead of the checkout link. Compared case-insensitively on the end of the
 * email (`isInternalEmail`).
 */
export const INTERNAL_EMAIL_DOMAINS = ["@1health.io", "@tachin.ai"] as const

/** `true` when the email ends (case-insensitive, trimmed) in one of `INTERNAL_EMAIL_DOMAINS`. */
export function isInternalEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase()
  return INTERNAL_EMAIL_DOMAINS.some((domain) => normalized.length > domain.length && normalized.endsWith(domain))
}
