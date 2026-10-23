import type { Page, Request, Route } from "@playwright/test"
import { addressesPage, addressRow } from "./addresses"
import { contactPointRow } from "./contacts"
import { ANN, json, PNG_1X1 } from "./core"
import { mockAccountDefaults } from "./defaults-account"
import { mockProfileDefaults } from "./defaults-profile"
import { INSURANCE_TYPE_KEY_BODY, INSURERS, insurancePage, insurancePolicy } from "./insurance"
import { MFA_TEST_QR } from "./mfa"
import { organizationsPage, organizationWire, type OrganizationWire } from "./orgs"
import { PERSONAL_FULL_MYSELF, PERSONAL_SSN_DIGITS } from "./personal"

/**
 * The integrated journey suite's fake backend (NG-9019, `e2e/journey-*.spec.ts`).
 * The per-story specs answer each call with a canned reply; this one keeps
 * Ann's data in memory and every write changes what the next read returns
 * (a Contacts save shows in the header and in the `/account` pickers, an
 * Account name change in the Profile header, …), the way the platform does.
 * One dispatcher route on `/api/{1h,pp}/**` answers what the journeys use;
 * anything else falls through to both pages' defaults
 * (`mockProfileDefaults`, `mockAccountDefaults`) and then to the fail-fast
 * guard. Install it before `launch(page)`. Synthetic data only.
 */

type Row = Record<string, unknown>

/** The NPI registry rows the Provider search knows (Story 9.1 shape). */
export const JOURNEY_NPI_RECORDS = Object.freeze([
  { id: 501, npi: 1588667638, providerFirstName: "Ann", providerLastName: "Lee", providerOrganizationName: null, providerFirstLineBusinessMailingAddress: "9 Oak Ave", providerBusinessMailingAddressCityName: "San Francisco", providerBusinessMailingAddressStateName: "CA", entityTypeCode: 1 },
  { id: 502, npi: 1730188030, providerFirstName: null, providerLastName: null, providerOrganizationName: "Bay Family Clinic", providerFirstLineBusinessMailingAddress: "1 Pine St", providerBusinessMailingAddressCityName: "San Francisco", providerBusinessMailingAddressStateName: "CA", entityTypeCode: 2 },
])

/** How the NPI combobox names the two registry rows. */
export const JOURNEY_NPI_LABELS = Object.freeze({
  personal: "1588667638, Ann Lee, San Francisco, CA",
  practice: "1730188030, Bay Family Clinic, 1 Pine St, San Francisco, CA",
})

/** Ann's organizations: DNN (tenant 42, with a primary contact) and 13 clinics, 14 in all (two pages of 12). */
function journeyOrganizations(): OrganizationWire[] {
  const dnn = organizationWire({
    tenantId: 42,
    organization: {
      id: 42,
      name: "DNN Diagnostics",
      shortOrganizationName: "DNN",
      type: ["Lab", "Health Provider"],
      personContacts: [{ firstName: "Dana", middleName: "M", lastName: "Ng", email: "dana@example.test", contactTypes: ["Primary"] }],
    },
  })
  const clinics = Array.from({ length: 13 }, (_, index) =>
    organizationWire({ tenantId: 100 + index, organization: { id: 100 + index, name: `Clinic ${String(index + 1).padStart(2, "0")}`, shortOrganizationName: null, type: ["Health Provider"], personContacts: [] } }),
  )
  return [dnn, ...clinics]
}

/** Ann at the start of every journey: Personal information filled (no Signature), one verified email and phone each. */
export const JOURNEY_START = Object.freeze({
  email: PERSONAL_FULL_MYSELF.email,
  phone: PERSONAL_FULL_MYSELF.phoneNumber,
  /** The seeded verified alternatives (Story 7.6 pickers). */
  altEmail: "ann.work@example.test",
  altPhone: "+14155550199",
})

export interface JourneyBackend {
  /** The user `myself` answers (mutable). */
  readonly user: Row
  readonly contacts: Row[]
  readonly addresses: Row[]
  readonly insurance: Row[]
  readonly state: { pictureId: number | null; verifyRequests: number[][] }
  /** Every write the page sent, in order, as `METHOD path` (relative to `/api/1h/` or `/api/pp/`). */
  readonly writes: () => string[]
  /** The JSON bodies of `PUT v2/user/edit`, in order. */
  readonly userEdits: () => Row[]
  /** The user opened the verification link sent for `value`: its Contact Point is verified from the next read. */
  readonly clickVerificationLink: (value: string) => void
}

export interface JourneyOptions {
  /** Seed verified alternatives for the `/account` primary pickers (Story 7.6). Default true. */
  readonly seedAlternatives?: boolean
}

/** Installs the stateful fake backend on `page` (both pages' defaults first, then the dispatcher). */
export async function createJourneyBackend(page: Page, options: JourneyOptions = {}): Promise<JourneyBackend> {
  const user: Row = {
    ...PERSONAL_FULL_MYSELF,
    signature: null,
    phoneNumberRegion: "us",
    roles: ["Patient"],
    preferredLanguage: "en",
    timeZone: "America/Chicago",
    locale: "en-US",
    mfaEnabled: true,
    totpEnabled: false,
  }
  const email = (overrides: Row): Row => contactPointRow({ type: "Email", phoneNumberRegion: null, ...overrides })
  const contacts: Row[] = [
    email({ id: 42, value: JOURNEY_START.email, label: "Primary", isNotificationEnabled: true }),
    contactPointRow({ id: 12, value: JOURNEY_START.phone, label: "Primary", isNotificationEnabled: true }),
  ]
  if (options.seedAlternatives ?? true) {
    contacts.push(email({ id: 43, value: JOURNEY_START.altEmail, label: "Work" }), contactPointRow({ id: 13, value: JOURNEY_START.altPhone, label: "Work" }))
  }
  const addresses: Row[] = [addressRow({ id: 1, addressLine1: "9 Oak Ave", addressLine2: "Apt 4", primary: true })]
  const insurance: Row[] = [insurancePolicy({ id: 55 })]
  const organizations = journeyOrganizations()
  const state = { pictureId: null as number | null, verifyRequests: [] as number[][] }
  const writes: string[] = []
  /** The caller's registered NPIs (`GET v2/user/npi`, Story 9.3); the register POST fills them. */
  const npi: { providerNpi: unknown; practiceNpi: unknown; hieEndpoint: unknown } = { providerNpi: null, practiceNpi: null, hieEndpoint: null }
  const userEdits: Row[] = []
  let nextId = 1000

  const sameValue = (type: unknown, a: unknown, b: unknown): boolean =>
    type === "Email" ? String(a).toLowerCase() === String(b).toLowerCase() : String(a) === String(b)

  /** `myself.email` / `phoneNumber` follow the Primary Contact Points (Story 3.4/3.6 on the platform). */
  const syncPrimaries = (): void => {
    const primaryEmail = contacts.find((row) => row.type === "Email" && row.label === "Primary")
    const primaryPhone = contacts.find((row) => row.type === "Mobile" && row.label === "Primary")
    if (primaryEmail) user.email = primaryEmail.value
    if (primaryPhone) {
      user.phoneNumber = primaryPhone.value
      user.phoneNumberRegion = primaryPhone.phoneNumberRegion
    }
  }

  /** A primary change through `PUT v2/user/edit` (Story 7.6) relabels the Contact Points: the new one Primary, the old one Old. */
  const relabelPrimary = (type: "Email" | "Mobile", value: unknown): void => {
    const next = contacts.find((row) => row.type === type && sameValue(type, row.value, value))
    if (!next || next.label === "Primary") return
    for (const row of contacts) if (row.type === type && row.label === "Primary") row.label = "Old"
    next.label = "Primary"
  }

  const body = (request: Request): Row => {
    try {
      const parsed: unknown = request.postDataJSON()
      return parsed !== null && typeof parsed === "object" ? (parsed as Row) : {}
    } catch {
      return {}
    }
  }
  const image = (route: Route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 })

  await mockProfileDefaults(page)
  await mockAccountDefaults(page)
  await page.route("**/api/{1h,pp}/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const pp = url.pathname.startsWith("/api/pp/")
    const path = url.pathname.replace(/^\/api\/(1h|pp)\//, "")
    const query = url.searchParams
    if (method !== "GET") writes.push(`${method} ${path}`)

    if (pp) {
      if (path === "profile-picture-id") return json(route, 200, { fileId: state.pictureId })
      if (method === "DELETE" && /^file\/\d+$/.test(path)) return route.fulfill({ status: 204 })
      if (path === "mfa/validate") {
        const valid = (body(request).code ?? "") === "123456"
        if (valid) user.totpEnabled = true
        return json(route, 200, valid)
      }
      return route.fallback()
    }

    // --- myself and the account writes (Epics 2, 7) ---
    if (path === "v2/user/myself" && method === "GET") return json(route, 200, user)
    if (path === "v2/user/edit" && method === "PUT") {
      const sent = body(request)
      userEdits.push(sent)
      if (typeof sent.email === "string") relabelPrimary("Email", sent.email)
      if (typeof sent.phoneNumber === "string") relabelPrimary("Mobile", sent.phoneNumber)
      Object.assign(user, sent)
      if (typeof sent.socialSecurityNumber === "string") user.socialSecurityNumber = sent.socialSecurityNumber === "n/a" ? "n/a" : `***-**-${sent.socialSecurityNumber.slice(-4)}`
      syncPrimaries()
      return json(route, 200, user)
    }
    if (path === "v2/user/time-zone") {
      user.timeZone = query.get("timeZone")
      return route.fulfill({ status: 204 })
    }
    if (path === "v2/user/locale") {
      user.locale = query.get("locale")
      return route.fulfill({ status: 204 })
    }
    if (path === "v2/person/me/ssn/expose") return json(route, 200, { id: ANN.personId, socialSecurityNumber: PERSONAL_SSN_DIGITS })

    // --- Contact Points (Epic 3) ---
    if (path === "v2/user/contact-point/list") return json(route, 200, contacts.filter((row) => row.type === query.get("type")))
    if (path === "v2/health/contact-point" && method === "POST") {
      const manage = body(request) as { contactPointsToAdd?: Row[]; contactPointsToUpdate?: Row[]; contactPointsToRemove?: number[] }
      for (const removed of manage.contactPointsToRemove ?? []) {
        const at = contacts.findIndex((row) => row.id === removed)
        if (at >= 0) contacts.splice(at, 1)
      }
      for (const update of manage.contactPointsToUpdate ?? []) {
        const row = contacts.find((candidate) => candidate.id === update.id)
        if (row) Object.assign(row, update)
      }
      for (const add of manage.contactPointsToAdd ?? []) {
        contacts.push({ id: nextId++, name: null, isVerified: add.type === "Social Media" ? null : false, phoneNumberRegion: null, ...add })
      }
      syncPrimaries()
      return route.fulfill({ status: 200 })
    }
    if (path === "v2/health/contact-point/verify" && method === "POST") {
      state.verifyRequests.push(((body(request).contactPointIds as number[] | undefined) ?? []).slice())
      return json(route, 200, { success: true, contactPointIdsWithSendError: [] })
    }

    // --- Signature, Profile Picture and file images (Stories 1.9, 1.10, 2.4) ---
    if (path === "v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload") {
      const id = nextId++
      user.signature = { id, name: "signature.png" }
      return json(route, 200, { id })
    }
    if (path === "v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload") {
      state.pictureId = nextId++
      return json(route, 200, { id: state.pictureId })
    }
    if (/^v2\/file\/\d+\/download$/.test(path) || path === "v2/user/profile-picture/preview") return image(route)

    // --- Addresses (Epic 4) ---
    if (path === "v2/person/location/list") return json(route, 200, addressesPage(addresses))
    if (path === "v2/public/countries") return json(route, 200, [{ id: 1, name: "United States" }, { id: 2, name: "Canada" }, { id: 3, name: "Australia" }, { id: 4, name: "Germany" }])
    if (path === "v2/person/location" && method === "POST") {
      const created = addressRow({ id: nextId++, addressLine2: null, county: null, ...body(request) })
      if (created.primary === true) for (const row of addresses) row.primary = false
      addresses.push(created)
      return json(route, 200, created)
    }
    const location = /^v2\/person\/location\/(\d+)$/.exec(path)
    if (location) {
      const id = Number(location[1])
      const at = addresses.findIndex((row) => row.id === id)
      if (at < 0) return json(route, 400, { message: `Operation failed. Location with id: '${id}' is not related to 'Person' with id: '${ANN.personId}'.`, code: 400 })
      if (method === "DELETE") {
        addresses.splice(at, 1)
        return json(route, 200, { id })
      }
      const sent = body(request)
      if (sent.primary === true) for (const row of addresses) row.primary = false
      for (const [key, value] of Object.entries(sent)) if (key !== "fullAddress") addresses[at][key] = value
      return json(route, 200, { id })
    }

    // --- Insurance (Epic 5) ---
    if (path === "v2/type/key/Insurance") return json(route, 200, INSURANCE_TYPE_KEY_BODY)
    if (path === "v2/health/insurance/organizations") {
      const name = (query.get("name") ?? "").toLowerCase()
      const data = INSURERS.filter((insurer) => insurer.name.toLowerCase().includes(name))
      return json(route, 200, { data, lastPage: true, pageNumber: 0, pageSize: 20, totalElements: data.length })
    }
    if (/^v2\/health\/insurance\/\d+\/file\/\d+\/download$/.test(path)) return image(route)
    if (path === "v2/health/patient/insurance" && method === "GET") return json(route, 200, insurancePage(insurance))
    const policyWrite = /^v2\/health\/patient\/insurance(?:\/(\d+))?$/.exec(path)
    if (policyWrite && (method === "POST" || method === "PUT")) {
      const sent = body(request)
      const org = sent.insuranceOrganizationDTO as { insuranceCompanyId?: number; insuranceCompanyName?: string } | undefined
      const insurer = INSURERS.find((candidate) => candidate.id === org?.insuranceCompanyId)
      const organization = { insuranceCompanyName: insurer?.name ?? org?.insuranceCompanyName ?? "Unknown", insuranceCompanyId: insurer?.id ?? nextId++, location: null, naicCode: null }
      if (method === "POST") {
        const created = insurancePolicy({ id: nextId++, insuranceGroupId: "n/a", expirationDate: "1970-01-01", frontSideCardFile: null, backSideCardFile: null, ...sent, insuranceOrganizationDTO: organization })
        insurance.push(created)
        return json(route, 200, created)
      }
      const target = insurance.find((row) => row.id === Number(policyWrite[1]))
      if (!target) return json(route, 400, { message: "Insurance not found", code: 400 })
      Object.assign(target, sent, { insuranceOrganizationDTO: organization })
      return json(route, 200, target)
    }
    const policyDelete = /^v2\/health\/insurance\/(\d+)$/.exec(path)
    if (policyDelete && method === "DELETE") {
      const at = insurance.findIndex((row) => row.id === Number(policyDelete[1]))
      if (at >= 0) insurance.splice(at, 1)
      return route.fulfill({ status: 200, body: "" })
    }

    // --- Authenticator app (Epic 8) ---
    if (path === "v2/mfa/enable/totp") return json(route, 200, { qrCode: MFA_TEST_QR })
    if (path === "v2/mfa/disable/totp") {
      user.totpEnabled = false
      return route.fulfill({ status: 200, body: "" })
    }

    // --- Provider registration (Epic 9) ---
    if (path === "v2/user/npi") return json(route, 200, npi)
    // Story 9.2: availability by registry row id (nobody holds the journey's NPIs), then one register POST.
    if (/^v2\/health\/npi\/\d+\/is-registered$/.test(path)) return json(route, 200, false)
    if (path === "v2/user/register/npi" && method === "POST") {
      const sent = route.request().postDataJSON() as { providerNpiId: number; practiceNpiId?: number }
      const record = (id: number | undefined) => JOURNEY_NPI_RECORDS.find((row) => row.id === id) ?? null
      npi.providerNpi = record(sent.providerNpiId)
      npi.practiceNpi = record(sent.practiceNpiId)
      return route.fulfill({ status: 200, body: "" })
    }
    if (path === "v2/public/npi/list") {
      const type = Number(query.get("entityTypeCode"))
      const text = (query.get("searchText") ?? "").trim().toLowerCase()
      const data = JOURNEY_NPI_RECORDS.filter((row) => row.entityTypeCode === type && (!text || JSON.stringify(row).toLowerCase().includes(text)))
      return json(route, 200, { data, totalElements: data.length })
    }

    // --- My Organizations (Epic 10) ---
    if (path === "v2/user/organization/portal") {
      const name = (query.get("name") ?? "").trim().toLowerCase()
      const pageNumber = Number(query.get("page") ?? 0)
      const matching = organizations.filter((row) => !name || `${row.organization?.name ?? ""} ${row.organization?.shortOrganizationName ?? ""}`.toLowerCase().includes(name))
      return json(route, 200, organizationsPage(matching.slice(pageNumber * 12, pageNumber * 12 + 12), { pageNumber, totalElements: matching.length }))
    }

    return route.fallback()
  })

  return {
    user,
    contacts,
    addresses,
    insurance,
    state,
    writes: () => [...writes],
    userEdits: () => [...userEdits],
    clickVerificationLink: (value: string) => {
      const row = contacts.find((candidate) => sameValue(candidate.type, candidate.value, value))
      if (!row) throw new Error(`no Contact Point ${value}`)
      row.isVerified = true
    },
  }
}
