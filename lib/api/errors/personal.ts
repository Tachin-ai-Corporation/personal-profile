import type { MessageRule } from "./core"

/** Fields of Personal information (Epic 2) the table can name. */
export type Field = "ssn"

/** Personal information (Epic 2): `Messages.SOCIAL_SECURITY_NUMBER_EXISTS`. */
export const rules: readonly MessageRule<Field>[] = [
  {
    scopes: ["personal"],
    pattern: /^The Social Security Number \{.*\} already belongs to another person\.$/,
    result: { kind: "field", field: "ssn", messageKey: "person.ssnTaken" },
  },
]
