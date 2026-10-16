import type { MessageKey } from "@/lib/shared/messages"
import type { ErrorScope, MessageRule } from "./core"

/**
 * Fields of the Contacts Sections (Epic 3) the table can name: the row's
 * `value`, `type` and `label`, and `primary` (the Primary rules, which no
 * single field holds: the Section shows them at Section level).
 */
export type Field = "value" | "type" | "label" | "primary"

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

const duplicateRules: readonly MessageRule<Field>[] = DUPLICATE_MESSAGE.flatMap(([scope, messageKey]) =>
  DUPLICATE_PATTERNS.map((pattern): MessageRule<Field> => ({ scopes: [scope], pattern, result: { kind: "field", field: "value", messageKey } })),
)

/**
 * The backend's Primary rules (`common/Messages.java`, `ContactPointServiceImpl`):
 * a Primary deleted or downgraded without a replacement, more than one
 * replacement or Primary per type, a Primary Email or Mobile in an add, a
 * person who already has a Primary of the type, and an unverified Primary.
 */
const PRIMARY_PATTERNS = [
  /^Operation failed\. In order to delete a primary contact of type '[^']*', please (?:create or )?update another one as primary\.$/,
  /^Operation failed\. In order to downgrade a primary contact point from type '[^']*', you must (?:create or )?update another one as primary\.$/,
  /^Operation failed\. You can provide only one replacement as primary contact from type '[^']*'\.$/,
  /^Operation failed\. You can create or update one primary contact point per type\.$/,
  /^Operation failed\. You aren't allowed to create a Primary contact point from types '.*'\.$/,
  /^Operation failed\. Person already has primary contact point from type '[^']*'\.$/,
  /^Operation failed\. You can't update contact point with id '\d+' as primary, because it's not verified\.$/,
]

/** Phone (Story 3.2): the per-type limit, an invalid number, an unknown label or type, and the Primary rules. */
const phoneRules: readonly MessageRule<Field>[] = [
  // `MAX_CONTACT_POINTS_PER_TYPE_ERROR` (20 per Contact Type).
  {
    scopes: ["phone"],
    pattern: /^Operation failed\. Person can have maximum of \d+ contact points per type\.$/,
    result: { kind: "field", field: "type", messageKey: "contacts.phoneLimit" },
  },
  // `INVALID_PHONE_PROVIDED` (common util `Messages`, `PhoneUtil.validateAndCleanForRegion`).
  { scopes: ["phone"], pattern: /^Invalid phone number provided \{.*\}\.$/, result: { kind: "field", field: "value", messageKey: "section.phoneInvalid" } },
  // `INVALID_ENUM_VALUE` for the Contact Point `Type`, then its `Label` (a list of the allowed values follows).
  {
    scopes: ["phone"],
    pattern: /^Invalid 'Type' specified\. Possible values are \[.*\]\.$/,
    result: { kind: "field", field: "type", messageKey: "contacts.choosePhoneType" },
  },
  {
    scopes: ["phone"],
    pattern: /^Invalid 'Label' specified\. Possible values are \[.*\]\.$/,
    result: { kind: "field", field: "label", messageKey: "contacts.labelNotOffered" },
  },
  ...PRIMARY_PATTERNS.map((pattern): MessageRule<Field> => ({
    scopes: ["phone"],
    pattern,
    result: { kind: "field", field: "primary", messageKey: "contacts.phonePrimaryFirst" },
  })),
]

export const rules: readonly MessageRule<Field>[] = [...duplicateRules, ...phoneRules]
