import type { Page, Request } from "@playwright/test"
import { ANN, mockProxy, type ProxyResponder } from "./core"

/**
 * Personal information (Team A, Epic 2) mocks. Reads come from `myself`
 * (`core.ts`) and the `Person` type key (`mockTypeKey`); Stories 2.1–2.4 add
 * their mocks here (SSN expose, Signature upload and version) with
 * `mockProxy`. The shared `PUT v2/user/edit` mock is `mockUserEdit` (core:
 * Team B's Stories 7.5/7.6 call it too). Prefix names with the area where
 * they could clash (`mockPersonalSignature`, not `mockSignature`).
 */

/** The Signature file id of `PERSONAL_FULL_MYSELF` (pair with `mockFileDownload(page, PERSONAL_SIGNATURE_FILE_ID)`). */
export const PERSONAL_SIGNATURE_FILE_ID = 501

/** `ANN` with every Personal information field filled, plus the account fields a Personal save must never send. */
export const PERSONAL_FULL_MYSELF = Object.freeze({
  ...ANN,
  namePrefix: "Dr.",
  middleName: "Marie",
  nameSuffix: "Jr.",
  otherNames: "Ann Smith",
  titles: "MD",
  birthDate: "1987-03-09",
  cityOfBirth: "Springfield",
  race: "Asian",
  ethnicity: "Not Hispanic or Latino",
  biologicalGender: "Female",
  genderIdentity: "Woman",
  sexualOrientation: "n/a",
  socialSecurityNumber: "***-**-1234",
  signature: { id: PERSONAL_SIGNATURE_FILE_ID, name: "signature.png" },
  email: "ann.lee@example.com",
  phoneNumber: "+14155552671",
})

/** The full SSN behind `PERSONAL_FULL_MYSELF`'s mask `***-**-1234`, as the expose call sends it (nine digits). */
export const PERSONAL_SSN_DIGITS = "987651234"

/** `PERSONAL_SSN_DIGITS` as the page shows it. */
export const PERSONAL_SSN_SHOWN = "987-65-1234"

/**
 * Mocks `GET v2/person/me/ssn/expose` (Story 2.3, Reveal). Default answer:
 * `{ id, socialSecurityNumber }` with `PERSONAL_SSN_DIGITS`. Returns the
 * requests it answered.
 */
export async function mockPersonalSsnExpose(
  page: Page,
  answer: ProxyResponder = { body: { id: ANN.personId, socialSecurityNumber: PERSONAL_SSN_DIGITS } },
): Promise<() => Request[]> {
  return mockProxy(page, "v2/person/me/ssn/expose", answer)
}
