import type { Page } from "@playwright/test"
import { mockShellDefaults } from "./core"
import { mockPracticeSupport, mockUserNpi } from "./npi"
import { mockOrganizations } from "./orgs"

/**
 * Team B owns this file (spec F7-1). Every planned read of `/account`
 * answered with an empty, valid default (spec F6-3); override per spec (the
 * newest route wins). Pair it with the fail-fast `test`. Keep it complete: a
 * Team B story that adds a read on `/account` adds its default here in the
 * same change; the shell and header reads come from `mockShellDefaults` (core).
 */
export async function mockAccountDefaults(page: Page): Promise<void> {
  await mockShellDefaults(page)
  await mockUserNpi(page)
  await mockPracticeSupport(page)
  await mockOrganizations(page)
}
