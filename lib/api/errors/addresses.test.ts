import { describe, expect, it } from "vitest"
import { messageFor } from "@/lib/shared/messages"
import { mapApiError, type ApiResponse, type MappedError } from ".."
import { rules } from "./addresses"

/**
 * Story 4.2 (NG-9026): the Addresses table, anchored on the exact backend
 * texts (`common/Messages.java`, `PersonLocationFactory`).
 */

/** An upstream error as `callApi` reports it (`{ message, code: <int> }`, `code` = HTTP status). */
const upstream = (message: string, statusCode = 400): ApiResponse<unknown> => ({
  success: false,
  statusCode,
  upstreamCode: statusCode,
  platformMessage: message,
  error: message,
})

const field = (name: string, messageKey: string): MappedError => ({ kind: "field", field: name, messageKey } as MappedError)

describe("addresses error table (Story 4.2)", () => {
  it.each([
    ["Operation failed. Personal location type is not provided.", field("type", "addresses.chooseType")],
    ["Operation failed. Location country is not provided.", field("country", "addresses.chooseCountry")],
    ["Operation failed. Location city is not provided.", field("city", "addresses.cityRequired")],
    ["Operation failed. Location address1 is not provided.", field("line1", "addresses.line1Required")],
    ["Operation failed. Location zip is not provided.", field("zip", "addresses.zipRequired")],
    ["Operation failed. Please, first set another Location as the primary one.", field("primary", "addresses.primaryFirst")],
    ["Operation failed. Location with id: '12' is not related to 'Person' with id: '7'.", field("row", "addresses.removedElsewhere")],
  ])("maps %j to its field", (message, mapped) => {
    expect(mapApiError("addresses", upstream(message))).toEqual(mapped)
  })

  it("every rule is scoped to addresses, anchored, with catalog copy", () => {
    for (const rule of rules) {
      expect(rule.scopes).toEqual(["addresses"])
      expect(rule.pattern.source.startsWith("^")).toBe(true)
      expect(rule.pattern.source.endsWith("$")).toBe(true)
      if (rule.result.kind === "field") expect(messageFor(rule.result.messageKey)).toBeTruthy()
    }
    expect(messageFor("addresses.primaryFirst")).toBe("Set another address as primary first")
    expect(messageFor("addresses.removedElsewhere")).toBe("This address was removed elsewhere, so your changes to it weren't saved.")
  })

  it.each([
    "Operation failed. Location zip is not provided",
    "Operation failed. Location zip is not provided. Extra",
    "operation failed. location zip is not provided.",
    "Operation failed. Please, first set another Location as the primary one",
    "Operation failed. Location with id: '12' is not related to 'Person' with id: '7'",
    "Operation failed. Location with id: 'x' is not related to 'Person' with id: '7'.",
    "Operation failed. Location with id: '12' is not related to '' with id: '7'.",
    "Error: Operation failed. Location with id: '12' is not related to 'Person' with id: '7'.",
  ])("leaves %j generic", (message) => {
    expect(mapApiError("addresses", upstream(message))).toEqual({ kind: "generic", message })
  })

  it("applies only to the addresses scope", () => {
    expect(mapApiError("phone", upstream("Operation failed. Location zip is not provided."))).toEqual({
      kind: "generic",
      message: "Operation failed. Location zip is not provided.",
    })
  })
})
