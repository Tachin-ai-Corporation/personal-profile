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
  userNpiPath,
} from "."
import { userEditPath } from "./user-edit-path.internal"

const API_DIR = join(process.cwd(), "lib/api")

/**
 * Internal modules are named `*.internal.ts` and never re-exported. Frozen
 * legacy exception (do not extend): `refresh-coordinator.ts`, internal to
 * `callApi` before the convention existed.
 */
const LEGACY_INTERNAL: readonly string[] = Object.freeze(["refresh-coordinator"])

/**
 * Frozen legacy list (do not extend): the infrastructure modules `index.ts`
 * exports by name. Every other module is a resource module, re-exported with
 * exactly one `export * from "./x"` line.
 */
const LEGACY_NAMED: readonly string[] = Object.freeze([
  "activity",
  "client",
  "config",
  "contact-points",
  "errors-codes",
  "fetcher",
  "files",
  "keys",
  "log-api-call",
  "myself",
  "session",
  "session-events",
  "types",
])

const INDEX = readFileSync(join(API_DIR, "index.ts"), "utf8")
const MODULES = readdirSync(API_DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "index.ts")
  .map((name) => name.replace(/\.ts$/, ""))
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const starLine = (name: string): RegExp => new RegExp(`^export \\* from "\\./${escape(name)}"$`, "m")

/** Every lib/api module's runtime exports (types vanish), `errors/` through its index. */
const LOADED = import.meta.glob<Record<string, unknown>>(["./*.ts", "./errors/index.ts", "!./*.test.ts", "!./index.ts"], { eager: true })

describe("planned lib/api modules (spec F6-3)", () => {
  it("re-exports every resource module with exactly one `export * from` line, so stories never edit index.ts", () => {
    const resources = MODULES.filter((name) => !name.endsWith(".internal") && !LEGACY_INTERNAL.includes(name) && !LEGACY_NAMED.includes(name))
    expect(resources).toEqual(expect.arrayContaining(["personal", "profile-picture", "addresses", "places", "insurance", "type-keys", "account", "mfa", "npi", "organizations", "practice-support"]))
    for (const name of resources) expect(INDEX, name).toMatch(starLine(name))
    for (const name of LEGACY_NAMED) expect(INDEX, name).toContain(`from "./${name}"`)
  })

  it("never re-exports an internal module", () => {
    for (const name of MODULES.filter((module) => module.endsWith(".internal") || LEGACY_INTERNAL.includes(module))) {
      expect(INDEX, name).not.toContain(`"./${name}"`)
    }
  })

  it("has unique value-export names across modules (an index name export would silently shadow an `export *` one)", () => {
    const owners = new Map<string, { module: string; value: unknown }>()
    const clashes: string[] = []
    for (const [path, exports] of Object.entries(LOADED)) {
      for (const [name, value] of Object.entries(exports)) {
        const seen = owners.get(name)
        // A plain re-export of the same binding (e.g. `CONTACT_POINT_TYPES` from keys.ts) is the same name, not a clash.
        if (seen && seen.value !== value) clashes.push(`${name}: ${seen.module} and ${path}`)
        if (!seen) owners.set(name, { module: path, value })
      }
    }
    expect(Object.keys(LOADED).length).toBeGreaterThan(20)
    expect(clashes).toEqual([])
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
