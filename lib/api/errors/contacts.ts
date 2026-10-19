import type { MessageKey } from "@/lib/shared/messages"
import type { ErrorScope, MessageRule } from "./core"

/**
 * Fields of the Contacts Sections (Epic 3) the table can name: the row's
 * `value`, `type` and `label`, `primary` (the Primary rules, which no
 * single field holds: the Section shows them at Section level), and `verify`
 * (Story 3.3: a verification link refused by the backend's cooldown, shown
 * as the row's help).
 */
export type Field = "value" | "type" | "label" | "primary" | "verify"

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
 * The backend's Primary rules (`common/Messages.java`, `ContactPointServiceImpl`),
 * each with its own Phone message (Story 3.4): a Primary deleted or
 * downgraded without a replacement, more than one replacement, more than one
 * Primary per type, a Primary Email or Mobile in an add, a person who
 * already has a Primary of the type, and an unverified Primary.
 */
const PRIMARY_RULES: ReadonlyArray<readonly [RegExp, MessageKey]> = [
  [/^Operation failed\. In order to delete a primary contact of type '[^']*', please (?:create or )?update another one as primary\.$/, "contacts.phonePrimaryFirst"],
  [
    /^Operation failed\. In order to downgrade a primary contact point from type '[^']*', you must (?:create or )?update another one as primary\.$/,
    "contacts.phonePrimaryDowngrade",
  ],
  [/^Operation failed\. You can provide only one replacement as primary contact from type '[^']*'\.$/, "contacts.phonePrimaryOneReplacement"],
  [/^Operation failed\. You can create or update one primary contact point per type\.$/, "contacts.phonePrimaryOnePerType"],
  [/^Operation failed\. You aren't allowed to create a Primary contact point from types '.*'\.$/, "contacts.phonePrimaryNotNew"],
  [/^Operation failed\. Person already has primary contact point from type '[^']*'\.$/, "contacts.phonePrimaryChanged"],
  [/^Operation failed\. You can't update contact point with id '\d+' as primary, because it's not verified\.$/, "contacts.phoneVerifyFirst"],
]

/** Phone (Stories 3.2–3.4): the per-type limit, an invalid number, an unknown label or type, the Primary rules and the verify cooldown. */
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
  ...PRIMARY_RULES.map(([pattern, messageKey]): MessageRule<Field> => ({ scopes: ["phone"], pattern, result: { kind: "field", field: "primary", messageKey } })),
  // `CONTACT_POINT_ALREADY_REQUESTED_VERIFICATION` (Story 3.3, `POST v2/health/contact-point/verify`): a resend within the
  // backend's cooldown of a successful send: 60 minutes, which the copy calls "the last hour".
  {
    scopes: ["phone"],
    pattern: /^There is already a pending verification for Contact '.*' submitted within the last 60 minutes\.$/,
    result: { kind: "field", field: "verify", messageKey: "contacts.verifyCooldown" },
  },
]

export const rules: readonly MessageRule<Field>[] = [...duplicateRules, ...phoneRules]
