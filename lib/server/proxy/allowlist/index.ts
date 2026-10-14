import "server-only"

import type { AllowlistEntry } from "../types"
import { entries as account } from "./account"
import { entries as addresses } from "./addresses"
import { entries as contacts } from "./contacts"
import { entries as core } from "./core"
import { entries as files } from "./files"
import { entries as insurance } from "./insurance"
import { entries as mfa } from "./mfa"
import { entries as npi } from "./npi"
import { entries as orgs } from "./orgs"
import { entries as personal } from "./personal"

/**
 * The shipped allowlist (AD-2), aggregated once from one file per planned
 * area, so a story adds its entry to its own area file only, in the same
 * change as the code that calls it.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [
  ...core,
  ...personal,
  ...contacts,
  ...addresses,
  ...insurance,
  ...files,
  ...account,
  ...mfa,
  ...npi,
  ...orgs,
]

export { BIOLOGICAL_GENDERS, ETHNICITIES, RACES, userEditBodySchema } from "./personal"
