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

/** The scopes whose Sections switch a Primary (Phone, Email), each with its own copy of a Primary rule. */
type PrimaryScope = "phone" | "email"

/**
 * The backend's Primary rules (`common/Messages.java`, `ContactPointServiceImpl`),
 * each with its own Phone message (Story 3.4) and Email message (Story 3.6):
 * a Primary deleted or downgraded without a replacement, more than one
 * replacement, more than one Primary per type, a Primary Email or Mobile in
 * an add, a person who already has a Primary of the type, and an unverified
 * Primary.
 */
const PRIMARY_RULES: ReadonlyArray<readonly [RegExp, Readonly<Record<PrimaryScope, MessageKey>>]> = [
  [
    /^Operation failed\. In order to delete a primary contact of type '[^']*', please (?:create or )?update another one as primary\.$/,
    { phone: "contacts.phonePrimaryFirst", email: "contacts.emailPrimaryFirst" },
  ],
  [
    /^Operation failed\. In order to downgrade a primary contact point from type '[^']*', you must (?:create or )?update another one as primary\.$/,
    { phone: "contacts.phonePrimaryDowngrade", email: "contacts.emailPrimaryDowngrade" },
  ],
  [
    /^Operation failed\. You can provide only one replacement as primary contact from type '[^']*'\.$/,
    { phone: "contacts.phonePrimaryOneReplacement", email: "contacts.emailPrimaryOneReplacement" },
  ],
  [/^Operation failed\. You can create or update one primary contact point per type\.$/, { phone: "contacts.phonePrimaryOnePerType", email: "contacts.emailPrimaryOnePerType" }],
  [/^Operation failed\. You aren't allowed to create a Primary contact point from types '.*'\.$/, { phone: "contacts.phonePrimaryNotNew", email: "contacts.emailPrimaryNotNew" }],
  [/^Operation failed\. Person already has primary contact point from type '[^']*'\.$/, { phone: "contacts.phonePrimaryChanged", email: "contacts.emailPrimaryChanged" }],
  [
    /^Operation failed\. You can't update contact point with id '\d+' as primary, because it's not verified\.$/,
    { phone: "contacts.phoneVerifyFirst", email: "contacts.emailVerifyFirst" },
  ],
]

/** The Primary rules of one scope, shown at Section level (field `primary`). */
const primaryRules = (scope: PrimaryScope): MessageRule<Field>[] =>
  PRIMARY_RULES.map(([pattern, messageKeys]): MessageRule<Field> => ({ scopes: [scope], pattern, result: { kind: "field", field: "primary", messageKey: messageKeys[scope] } }))

/**
 * `CONTACT_POINT_ALREADY_REQUESTED_VERIFICATION` (Story 3.3, `POST v2/health/contact-point/verify`): a resend within the
 * backend's cooldown of a successful send: 60 minutes, which the copy calls "the last hour".
 */
const VERIFY_COOLDOWN = /^There is already a pending verification for Contact '.*' submitted within the last 60 minutes\.$/

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
  ...primaryRules("phone"),
  { scopes: ["phone"], pattern: VERIFY_COOLDOWN, result: { kind: "field", field: "verify", messageKey: "contacts.verifyCooldown" } },
]

/**
 * Email (Stories 3.5, 3.6): an invalid address, the per-type limit, an
 * unknown label, the Primary rules, the address in use by another account
 * and the verify cooldown. The limit names `type` and the Primary rules
 * `primary`, which the Email Section maps to no field, so they show at
 * Section level (or in the Make primary toast).
 */
const emailRules: readonly MessageRule<Field>[] = [
  // `INSTANT_TEST_INVALID_EMAIL` ("%s is not a valid email.", `ContactPointServiceImpl` validating an Email value).
  { scopes: ["email"], pattern: /^.+ is not a valid email\.$/, result: { kind: "field", field: "value", messageKey: "contacts.emailInvalid" } },
  // `MAX_CONTACT_POINTS_PER_TYPE_ERROR` (20 per Contact Type).
  {
    scopes: ["email"],
    pattern: /^Operation failed\. Person can have maximum of \d+ contact points per type\.$/,
    result: { kind: "field", field: "type", messageKey: "contacts.emailLimit" },
  },
  // `INVALID_ENUM_VALUE` for the Contact Point `Label` (a list of the allowed values follows).
  {
    scopes: ["email"],
    pattern: /^Invalid 'Label' specified\. Possible values are \[.*\]\.$/,
    result: { kind: "field", field: "label", messageKey: "contacts.labelNotOffered" },
  },
  ...primaryRules("email"),
  // `USER_ALREADY_EXISTS` (`ContactPointServiceImpl.java:144-147`): making Primary an address another account signs in
  // with. The whole request is rolled back.
  { scopes: ["email"], pattern: /^User with email '.*' already exists\.$/, result: { kind: "field", field: "primary", messageKey: "contacts.emailInUse" } },
  { scopes: ["email"], pattern: VERIFY_COOLDOWN, result: { kind: "field", field: "verify", messageKey: "contacts.emailVerifyCooldown" } },
]

/**
 * Social media (Story 3.7): an invalid link and the per-type limit. The
 * limit names `type`, which the Social Section maps to no field, so it shows
 * at Section level.
 */
const socialRules: readonly MessageRule<Field>[] = [
  // `INVALID_URL_PROVIDED` (`Messages.java:745`, `Helper.validateURL` on every Social Media value).
  { scopes: ["social"], pattern: /^Invalid URL provided '.*'\.$/, result: { kind: "field", field: "value", messageKey: "contacts.socialInvalid" } },
  // `MAX_CONTACT_POINTS_PER_TYPE_ERROR` (20 per Contact Type).
  {
    scopes: ["social"],
    pattern: /^Operation failed\. Person can have maximum of \d+ contact points per type\.$/,
    result: { kind: "field", field: "type", messageKey: "contacts.socialLimit" },
  },
]

export const rules: readonly MessageRule<Field>[] = [...duplicateRules, ...phoneRules, ...emailRules, ...socialRules]
