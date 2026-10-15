/** `/account` copy needed by the shared error tables (`lib/api/errors/account.ts`); Epic 7 adds the rest. */
export const ACCOUNT_MESSAGES = {
  primaryEmailInUse: "This email is already used by another account", // DRAFT COPY (email in use on PUT user/edit)
} as const
