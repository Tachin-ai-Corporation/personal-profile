import type { MessageRule } from "./core"

/**
 * Fields of Addresses (Epic 4) the table can name (Story 4.2): a row's
 * Address Type, Country, line 1, City and Zip, and `primary` (its "Set as
 * primary" checkbox). The Section maps them to the row that failed. `row`
 * (Story 4.4) is the row as a whole (it was removed elsewhere): the Section
 * shows it at Section level.
 */
export type Field = "type" | "country" | "line1" | "city" | "zip" | "primary" | "row"

/**
 * Addresses (Story 4.2): the backend's exact texts (`common/Messages.java`,
 * `PersonLocationFactory`): the five required fields of a POST
 * (`PERSON_LOCATION_TYPE_IS_NOT_PROVIDED`, `LOCATION_{COUNTRY,CITY,ADDRESS1,ZIP}_IS_NOT_PROVIDED`),
 * each at its field, and `SET_PRIMARY_LOCATION` (the current Primary sent
 * with `primary: false`, or deleted) at the row's "Set as primary". Story
 * 4.4: `LOCATION_IS_NOT_RELATED_TO_ERROR` (a PUT or DELETE of an address
 * that isn't the caller's any more, e.g. removed on another device) at the
 * whole row ("removed elsewhere").
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
  {
    scopes: ["addresses"],
    pattern: /^Operation failed\. Location with id: '\d+' is not related to '[^']+' with id: '\d+'\.$/,
    result: { kind: "field", field: "row", messageKey: "addresses.removedElsewhere" },
  },
]
