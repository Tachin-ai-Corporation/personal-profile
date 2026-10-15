import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ACCOUNT_LOCALE,
  addressesListPath,
  countriesPath,
  fetchers,
  INSURANCE_CARD_RELATIONS,
  INSURANCE_TYPE_KEY,
  insuranceCardUploadPath,
  insuranceListPath,
  INSURER_PAGE_SIZE,
  isPlacesCountry,
  localePath,
  mfaDisableTotpPath,
  mfaEnableTotpPath,
  mfaValidatePath,
  NPI_PAGE_SIZE,
  NPI_SEARCH_MAX_LENGTH,
  npiIsRegisteredPath,
  orgLogoPath,
  organizationsPath,
  ORGS_PAGE_SIZE,
  PERSON_TYPE_KEY,
  PERSON_VALUE_LISTS,
  personalNpiSearchPath,
  PINNED_COUNTRY_CODES,
  PLACES_COUNTRIES,
  placesAutocompletePath,
  placesDetailsPath,
  practiceNpiSearchPath,
  practiceSupportPath,
  profilePictureIdPath,
  profilePictureUploadPath,
  registerNpiPath,
  ssnExposePath,
  timeZonePath,
  userEditPath,
  userNpiPath,
} from "."

const API_DIR = join(process.cwd(), "lib/api")
/** Internal to `callApi`, never part of the public surface. */
const INTERNAL = new Set(["refresh-coordinator.ts"])

describe("planned lib/api modules (spec F6-3)", () => {
  it("re-exports every resource module from index.ts, so stories never edit it", () => {
    const index = readFileSync(join(API_DIR, "index.ts"), "utf8")
    const modules = readdirSync(API_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "index.ts" && !INTERNAL.has(name))
    expect(modules).toEqual(expect.arrayContaining(["personal.ts", "profile-picture.ts", "addresses.ts", "places.ts", "insurance.ts", "type-keys.ts", "account.ts", "mfa.ts", "npi.ts", "organizations.ts", "practice-support.ts"]))
    for (const name of modules) expect(index).toContain(`from "./${name.replace(/\.ts$/, "")}"`)
  })

  it("keeps the legacy fetchers object frozen", () => {
    expect(Object.isFrozen(fetchers)).toBe(true)
    expect(Object.keys(fetchers)).toEqual(["myself", "contactPoints"])
  })

  it("Team A paths and constants", () => {
    expect(PERSON_TYPE_KEY).toBe("Person")
    expect(PERSON_VALUE_LISTS).toEqual(["race", "ethnicity", "biologicalGender"])
    expect(userEditPath()).toBe("/api/1h/v2/user/edit")
    expect(ssnExposePath()).toBe("/api/1h/v2/person/me/ssn/expose")
    expect(profilePictureIdPath()).toBe("/api/pp/profile-picture-id")
    expect(profilePictureUploadPath()).toBe("/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
    expect(addressesListPath()).toBe("/api/1h/v2/person/location/list?page=0&size=100")
    expect(countriesPath()).toBe("/api/1h/v2/public/countries")
    expect(PINNED_COUNTRY_CODES).toEqual(["US", "CA", "AU"])
    expect(placesAutocompletePath()).toBe("/api/places/autocomplete")
    expect(placesDetailsPath()).toBe("/api/places/details")
    expect(PLACES_COUNTRIES).toEqual(["US", "CA", "AU"])
    expect(INSURANCE_TYPE_KEY).toBe("Insurance")
    expect(INSURER_PAGE_SIZE).toBe(20)
    expect(insuranceListPath()).toBe("/api/1h/v2/health/patient/insurance?page=0&size=100")
    expect(insuranceCardUploadPath(55, "back")).toBe(`/api/1h/v2/health/type/Insurance/55/relation/${INSURANCE_CARD_RELATIONS.back}/file/upload`)
  })

  it.each([
    ["US", true],
    ["ca", true],
    ["AU", true],
    ["GB", false],
    ["", false],
    [null, false],
    [undefined, false],
  ] as const)("isPlacesCountry(%j) is %s", (code, expected) => {
    expect(isPlacesCountry(code)).toBe(expected)
  })

  it("Team B paths and constants", () => {
    expect(ACCOUNT_LOCALE).toBe("en-US")
    expect(timeZonePath("America/Chicago")).toBe("/api/1h/v2/user/time-zone?timeZone=America%2FChicago")
    expect(localePath()).toBe("/api/1h/v2/user/locale?locale=en-US")
    expect(mfaEnableTotpPath()).toBe("/api/1h/v2/mfa/enable/totp")
    expect(mfaDisableTotpPath()).toBe("/api/1h/v2/mfa/disable/totp")
    expect(mfaValidatePath()).toBe("/api/pp/mfa/validate")
    expect(NPI_PAGE_SIZE).toBe(10)
    expect(NPI_SEARCH_MAX_LENGTH).toBe(100)
    expect(personalNpiSearchPath("ann lee", 0)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=1&searchText=ann+lee&page=0&limit=10")
    expect(practiceNpiSearchPath("", 3)).toBe("/api/1h/v2/public/npi/list?entityTypeCode=2&searchText=&page=3&limit=10")
    expect(userNpiPath()).toBe("/api/1h/v2/user/npi")
    expect(npiIsRegisteredPath(77)).toBe("/api/1h/v2/health/npi/77/is-registered")
    expect(registerNpiPath()).toBe("/api/1h/v2/user/register/npi")
    expect(ORGS_PAGE_SIZE).toBe(12)
    expect(organizationsPath("a&b", 1)).toBe("/api/1h/v2/user/organization/portal?name=a%26b&page=1&size=12")
    expect(orgLogoPath(9)).toBe("/api/pp/org-logo/9")
    expect(practiceSupportPath()).toBe("/api/pp/practice-support")
  })
})
