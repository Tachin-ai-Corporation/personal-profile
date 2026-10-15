import type { Page } from "@playwright/test"
import { mockAddresses, mockCountries } from "./addresses"
import { mockShellDefaults, mockTypeKey } from "./core"
import { mockInsurance } from "./insurance"

/**
 * Team A owns this file (spec F7-1). Every planned read of `/` answered with
 * an empty, valid default (spec F6-3), so a spec mocks only what it is about:
 * call this first, then override (the newest route wins). Pair it with the
 * fail-fast `test`. Keep it complete: a Team A story that adds a read on `/`
 * adds its default here in the same change; the shell and header reads come
 * from `mockShellDefaults` (core).
 */
export async function mockProfileDefaults(page: Page): Promise<void> {
  await mockShellDefaults(page)
  await mockTypeKey(page, "Person")
  await mockTypeKey(page, "ContactPoint")
  await mockTypeKey(page, "Insurance")
  await mockAddresses(page)
  await mockCountries(page)
  await mockInsurance(page)
}
