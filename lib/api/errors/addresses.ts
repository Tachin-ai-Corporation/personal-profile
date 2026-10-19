import type { MessageRule } from "./core"

/**
 * Fields of Addresses (Epic 4) the table can name (Story 4.2): a row's
 * Address Type, Country, line 1, City and Zip, and `primary` (its "Set as
 * primary" checkbox). The Section maps them to the row that failed.
 */
export type Field = "type" | "country" | "line1" | "city" | "zip" | "primary"

/**
 * Addresses (Story 4.2): the backend's exact texts (`common/Messages.java`,
 * `PersonLocationFactory`): the five required fields of a POST
 * (`PERSON_LOCATION_TYPE_IS_NOT_PROVIDED`, `LOCATION_{COUNTRY,CITY,ADDRESS1,ZIP}_IS_NOT_PROVIDED`),
 * each at its field, and `SET_PRIMARY_LOCATION` (the current Primary sent
 * with `primary: false`) at the row's "Set as primary".
 */
export const rules: readonly MessageRule<Field>[] = [
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Personal location type is not provided\.$/,
    result: { kind: "field", field: "type", messageKey: "addresses.chooseType" },
  },
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Location country is not provided\.$/,
    result: { kind: "field", field: "country", messageKey: "addresses.chooseCountry" },
  },
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Location city is not provided\.$/,
    result: { kind: "field", field: "city", messageKey: "addresses.cityRequired" },
  },
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Location address1 is not provided\.$/,
    result: { kind: "field", field: "line1", messageKey: "addresses.line1Required" },
  },
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Location zip is not provided\.$/,
    result: { kind: "field", field: "zip", messageKey: "addresses.zipRequired" },
  },
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Please, first set another Location as the primary one\.$/,
    result: { kind: "field", field: "primary", messageKey: "addresses.primaryFirst" },
  },
]
