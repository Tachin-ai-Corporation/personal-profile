import { describe, expect, it } from "vitest"
import { messageFor } from "@/lib/shared/messages"
import { mapApiError, type ApiResponse, type ErrorScope, type MappedError } from ".."
import { rules } from "./contacts"

/**
 * Stories 3.2–3.3 (NG-9023): the Contacts table's Phone rules, anchored on the
 * exact backend texts (`common/Messages.java`; `INVALID_PHONE_PROVIDED` in the
 * common util `Messages`). The duplicate rules are covered in `errors.test.ts`.
 */

/** An upstream error as `callApi` reports it (`{ message, code: <int> }`, `code` = HTTP status). */
const upstream = (message: string, statusCode = 400): ApiResponse<unknown> => ({
  success: false,
  statusCode,
  upstreamCode: statusCode,
  platformMessage: message,
  error: message,
})

const LIMIT = "Operation failed. Person can have maximum of 20 contact points per type."
const INVALID_PHONE = "Invalid phone number provided {+1415555}."
const INVALID_TYPE = "Invalid 'Type' specified. Possible values are [Mobile, Email, Landline, Social Media, Fax, Home, Work, Other]."
const INVALID_LABEL = "Invalid 'Label' specified. Possible values are [Primary, Work, Home, Personal, Old, Main, Mailing List, Partnership Organization]."
const PRIMARY_RULES = [
  "Operation failed. In order to delete a primary contact of type 'Mobile', please update another one as primary.",
  "Operation failed. In order to delete a primary contact of type 'Landline', please create or update another one as primary.",
  "Operation failed. In order to downgrade a primary contact point from type 'Mobile', you must update another one as primary.",
  "Operation failed. In order to downgrade a primary contact point from type 'Landline', you must create or update another one as primary.",
  "Operation failed. You can provide only one replacement as primary contact from type 'Landline'.",
  "Operation failed. You can create or update one primary contact point per type.",
  "Operation failed. You aren't allowed to create a Primary contact point from types '[MOBILE, EMAIL]'.",
  "Operation failed. Person already has primary contact point from type 'Mobile'.",
  "Operation failed. You can't update contact point with id '12' as primary, because it's not verified.",
]

const COOLDOWN = "There is already a pending verification for Contact '+14155550111' submitted within the last 60 minutes."
const VERIFY: MappedError = { kind: "field", field: "verify", messageKey: "contacts.verifyCooldown" }

const PRIMARY: MappedError = { kind: "field", field: "primary", messageKey: "contacts.phonePrimaryFirst" }

describe("contacts errors: phone rules", () => {
  it.each<[string, string, MappedError]>([
    ["the per-type limit", LIMIT, { kind: "field", field: "type", messageKey: "contacts.phoneLimit" }],
    ["an invalid phone", INVALID_PHONE, { kind: "field", field: "value", messageKey: "section.phoneInvalid" }],
    ["an invalid type", INVALID_TYPE, { kind: "field", field: "type", messageKey: "contacts.choosePhoneType" }],
    ["an invalid label", INVALID_LABEL, { kind: "field", field: "label", messageKey: "contacts.labelNotOffered" }],
    ...PRIMARY_RULES.map((message): [string, string, MappedError] => [message, message, PRIMARY]),
    ["the verify cooldown (Story 3.3)", COOLDOWN, VERIFY],
    ["the verify cooldown of an email-shaped contact", "There is already a pending verification for Contact 'ann@example.com' submitted within the last 60 minutes.", VERIFY],
  ])("maps %s", (_name, message, expected) => {
    expect(mapApiError("phone", upstream(message))).toEqual(expected)
  })

  it("names the catalog copy the Section shows", () => {
    expect(messageFor("contacts.phoneLimit")).toBe("You've reached the limit of 20 phones")
    expect(messageFor("section.phoneInvalid")).toBe("Enter a valid phone number")
    expect(messageFor("contacts.labelNotOffered")).toBe("Choose a label from the list")
    expect(messageFor("contacts.choosePhoneType")).toBe("Choose Mobile or Landline")
    expect(messageFor("contacts.phonePrimaryFirst")).toBe("Make another phone primary first")
    expect(messageFor("contacts.verifyCooldown")).toBe("A link was already sent in the last hour. Check your texts.")
  })

  it.each<[string, ErrorScope, string]>([
    ["the limit outside phone", "email", LIMIT],
    ["an invalid phone outside phone", "personal", INVALID_PHONE],
    ["an invalid label outside phone", "social", INVALID_LABEL],
    ["an invalid type outside phone", "email", INVALID_TYPE],
    ["a Primary rule outside phone", "email", PRIMARY_RULES[0]],
    ["a near-miss limit (no period)", "phone", LIMIT.slice(0, -1)],
    ["a limit with a prefix", "phone", `Error: ${LIMIT}`],
    ["an invalid phone without braces", "phone", "Invalid phone number provided +1415555."],
    ["another enum attribute", "phone", "Invalid 'Value' specified. Possible values are [x]."],
    ["an enum text without its list", "phone", "Invalid 'Label' specified. Possible values are ."],
    ["a Primary rule with a suffix", "phone", `${PRIMARY_RULES[5]} Try again.`],
    ["the verify cooldown outside phone", "email", COOLDOWN],
    ["a verify cooldown with a suffix", "phone", `${COOLDOWN} Try later.`],
    ["a verify cooldown without minutes", "phone", "There is already a pending verification for Contact '+14155550111' submitted within the last minutes."],
    ["a verify cooldown of another window (the copy says the last hour)", "phone", "There is already a pending verification for Contact '+14155550111' submitted within the last 5 minutes."],
    ["a near-miss Primary rule", "phone", "Operation failed. In order to delete a primary contact of type 'Mobile', please update another one."],
  ])("leaves %s as generic with the platform message", (_name, scope, message) => {
    expect(mapApiError(scope, upstream(message))).toEqual({ kind: "generic", message })
  })

  it("never matches a 5xx or a 403", () => {
    expect(mapApiError("phone", upstream(LIMIT, 500))).toEqual({ kind: "generic" })
    expect(mapApiError("phone", upstream(LIMIT, 403))).toEqual({ kind: "forbidden" })
  })

  it("anchors every pattern to the whole message", () => {
    for (const rule of rules) {
      expect(rule.pattern.source.startsWith("^")).toBe(true)
      expect(rule.pattern.source.endsWith("$")).toBe(true)
    }
  })
})
