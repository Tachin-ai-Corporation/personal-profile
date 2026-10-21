import { describe, expect, it } from "vitest"
import { messageFor, type MessageKey } from "@/lib/shared/messages"
import { mapApiError, type ApiResponse, type MappedError } from ".."
import { rules, type Field } from "./insurance"

/**
 * Story 5.2 (NG-9029): the Insurance editor's rules, anchored on the exact
 * backend texts (`bo-core common/Messages.java`, `OneHealthServiceImpl`
 * insurance validation, `StringUtil` length texts; `INVALID_PHONE_PROVIDED`
 * in the common util `Messages`).
 */

/** An upstream error as `callApi` reports it (`{ message, code: <int> }`, `code` = HTTP status). */
const upstream = (message: string, statusCode = 400): ApiResponse<unknown> => ({
  success: false,
  statusCode,
  upstreamCode: statusCode,
  platformMessage: message,
  error: message,
})

const at = (field: Field, messageKey: MessageKey): MappedError => ({ kind: "field", field, messageKey })

describe("insurance errors (Story 5.2)", () => {
  it.each<[string, MappedError]>([
    ["Member Id Number is missing.", at("memberId", "insurance.memberIdRequired")],
    ["Member Id Number should be at least 3 symbols.", at("memberId", "insurance.memberIdLength")],
    ["Member Id Number cannot exceed 32 symbols.", at("memberId", "insurance.memberIdLength")],
    ["Group Number should be at least 3 symbols.", at("groupId", "insurance.groupIdLength")],
    ["Group Number cannot exceed 32 symbols.", at("groupId", "insurance.groupIdLength")],
    [
      "Patient with ID {12} already has an existing insurance record associated with Insurance Company ID {7} and Policy Number {XKH123}",
      at("memberId", "insurance.duplicatePolicy"),
    ],
    [
      "Unable to update insurance. There is already an existing insurance record associated with Insurance Company ID {7} and Policy Number {XKH123}",
      at("memberId", "insurance.duplicatePolicy"),
    ],
    ["You can not have multiple insurance records from same type with precedence field set to Primary.", at("precedence", "insurance.primaryTaken")],
    ["Please provide subscriber's first name.", at("subscriberFirstName", "person.firstNameRequired")],
    ["Please provide subscriber's last name.", at("subscriberLastName", "person.lastNameRequired")],
    ["First name cannot exceed 24 characters.", at("subscriberFirstName", "person.firstNameTooLong")],
    ["Last name cannot exceed 24 characters.", at("subscriberLastName", "person.lastNameTooLong")],
    ["Please provide subscriber's email.", at("subscriberEmail", "insurance.subscriberEmailRequired")],
    ["sam@ is not valid email.", at("subscriberEmail", "contacts.emailInvalid")],
    ["Invalid phone number provided {+1415555}.", at("subscriberPhone", "section.phoneInvalid")],
    ["Please, provide subscriber's birth date.", at("subscriberBirthDate", "person.birthDateRequired")],
    ["Invalid date of birth. The patient should be between 18 and 120 years old.", at("subscriberBirthDate", "insurance.subscriberAge")],
    ["Operation failed. Insurance Company with ID: 7 does not exist.", at("insurer", "insurance.insurerMissing")],
    ["Patient with id: {12} does not have an insurance with id: {55}", at("policy", "insurance.policyMissing")],
  ])("maps %j", (message, expected) => {
    expect(mapApiError("insurance", upstream(message))).toEqual(expected)
  })

  it("matches only the Insurance Section, and only the whole message", () => {
    expect(mapApiError("personal", upstream("Please provide subscriber's email."))).toEqual({ kind: "generic", message: "Please provide subscriber's email." })
    expect(mapApiError("insurance", upstream("Member Id Number should be at least 3 symbols. Retry"))).toEqual({
      kind: "generic",
      message: "Member Id Number should be at least 3 symbols. Retry",
    })
    expect(mapApiError("insurance", upstream("Operation failed. Insurance Company with ID: x does not exist."))).toMatchObject({ kind: "generic" })
    for (const rule of rules) expect(rule.scopes).toEqual(["insurance"])
  })

  it("leaves anything else generic, a 5xx included", () => {
    expect(mapApiError("insurance", upstream("Something went wrong. Please contact an administrator."))).toEqual({
      kind: "generic",
      message: "Something went wrong. Please contact an administrator.",
    })
    expect(mapApiError("insurance", upstream("Please provide subscriber's email.", 500))).toEqual({ kind: "generic" })
  })

  it("names the catalog copy the editor shows", () => {
    expect(messageFor("insurance.memberIdLength")).toBe("Member ID must be 3 to 32 characters")
    expect(messageFor("insurance.groupIdLength")).toBe("Group ID must be 3 to 32 characters")
    expect(messageFor("insurance.duplicatePolicy")).toBe("This policy is already on your profile")
    expect(messageFor("insurance.primaryTaken")).toBe("You already have a primary policy of this type")
    expect(messageFor("insurance.subscriberAge")).toBe("You must be 18 to 120 years old")
    expect(messageFor("insurance.insurerMissing")).toBe("This insurer is no longer listed. Search again.")
    expect(messageFor("insurance.policyMissing")).toBe("This policy is no longer on your profile.")
  })
})

describe("insurance errors: the policy delete (Story 5.5, decision 1B)", () => {
  it.each<[string, MappedError]>([
    ["Insurance with id: 55 not found.", at("policy", "insurance.policyMissing")],
    ["Insurance with Id: 55 is already deleted.", at("policy", "insurance.policyMissing")],
    ["Patient with id: {12} does not have an insurance with id: {55}", at("policy", "insurance.policyMissing")],
  ])("maps the already-gone answer %j to `policy`", (message, expected) => {
    expect(mapApiError("insurance", upstream(message))).toEqual(expected)
  })

  it.each([
    "Insurance with id: x not found.",
    "Insurance with id: 55 not found",
    "Insurance with Id: 55 not found.",
    "Insurance with id: 55 is already deleted.",
    "Insurance with Id: {55} is already deleted.",
    "Insurance with id: 55 does not exist",
  ])("leaves the near miss %j generic", (message) => {
    expect(mapApiError("insurance", upstream(message))).toEqual({ kind: "generic", message })
  })

  it("matches only the Insurance Section, never a 5xx", () => {
    expect(mapApiError("addresses", upstream("Insurance with Id: 55 is already deleted."))).toMatchObject({ kind: "generic" })
    expect(mapApiError("insurance", upstream("Insurance with Id: 55 is already deleted.", 500))).toEqual({ kind: "generic" })
  })

  it("names no delete-only copy: the delete's own toast comes from the feature", () => {
    for (const rule of rules) expect(rule.result).not.toMatchObject({ messageKey: "insurance.policyAlreadyRemoved" })
  })
})
