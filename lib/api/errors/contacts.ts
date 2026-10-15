import type { MessageKey } from "@/lib/shared/messages"
import type { ErrorScope, MessageRule } from "./core"

/** Fields of the Contacts Sections (Epic 3) the table can name. */
export type Field = "value"

/**
 * Contacts (Epic 3): duplicate values, `Messages.PERSON_ALREADY_HAS_CONTACT_POINT_ERROR`
 * and `Messages.CONTACT_POINTS_DUPLICATE_FOUND`, shown at the value field.
 */
const DUPLICATE_PATTERNS = [
  /^Operation failed\. Person with id '\d+' already has contact point with value '.*'\.$/,
  /^Duplicate Contact Points specified\.$/,
]

const DUPLICATE_MESSAGE: ReadonlyArray<readonly [ErrorScope, MessageKey]> = [
  ["phone", "contacts.duplicatePhone"],
  ["email", "contacts.duplicateEmail"],
  ["social", "contacts.duplicateSocial"],
]

export const rules: readonly MessageRule<Field>[] = DUPLICATE_MESSAGE.flatMap(([scope, messageKey]) =>
  DUPLICATE_PATTERNS.map((pattern): MessageRule<Field> => ({ scopes: [scope], pattern, result: { kind: "field", field: "value", messageKey } })),
)
