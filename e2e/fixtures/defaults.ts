import type { Page } from "@playwright/test"
import { mockAddresses, mockCountries } from "./addresses"
import { mockContacts } from "./contacts"
import { mockMyself, mockProfilePictureId, mockTypeKey } from "./core"
import { mockInsurance } from "./insurance"
import { mockPracticeSupport, mockUserNpi } from "./npi"
import { mockOrganizations } from "./orgs"

/**
 * Every planned read of `/` answered with an empty, valid default (spec
 * F6-3), so a spec mocks only what it is about: call this first, then
 * override (the newest route wins). Pair it with the fail-fast `test`.
 */
export async function mockProfileDefaults(page: Page): Promise<void> {
  await mockMyself(page)
  await mockContacts(page)
  await mockTypeKey(page, "Person")
  await mockTypeKey(page, "ContactPoint")
  await mockTypeKey(page, "Insurance")
  await mockAddresses(page)
  await mockCountries(page)
  await mockInsurance(page)
  await mockProfilePictureId(page)
}

/** Every planned read of `/account` answered with an empty, valid default; override per spec. */
export async function mockAccountDefaults(page: Page): Promise<void> {
  await mockMyself(page)
  await mockContacts(page)
  await mockProfilePictureId(page) // the header is shared by both pages
  await mockUserNpi(page)
  await mockPracticeSupport(page)
  await mockOrganizations(page)
}
