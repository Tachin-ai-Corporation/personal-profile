import type { MessageRule } from "./core"

/** Fields of Account settings (Epic 7) the table can name. */
export type Field = "primaryEmail"

/** Account settings (Story 7.6): `Messages.USER_ALREADY_EXISTS` on a Primary email switch. */
export const rules: readonly MessageRule<Field>[] = [
  {
    scopes: ["account"],
    pattern: /^User with email '.*' already exists\.$/,
    result: { kind: "field", field: "primaryEmail", messageKey: "account.primaryEmailInUse" },
  },
]
