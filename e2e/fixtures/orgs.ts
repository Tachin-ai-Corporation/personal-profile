import type { Page, Request } from "@playwright/test"
import { mockProxy, type ProxyAnswer } from "./core"

/** My Organizations (Team B, Epic 10) mocks. Stories 10.1–10.3 add org-logo and hand-off mocks here. */

export interface OrganizationWire {
  readonly tenantId: number | string
  readonly enabledInTenant: boolean
  readonly tenantLogo: { readonly publicUrl: string } | null
  readonly organization: {
    readonly id?: number
    readonly name: string
    readonly shortOrganizationName?: string | null
    readonly type: readonly string[]
    readonly personContacts: readonly {
      readonly firstName?: string | null
      readonly middleName?: string | null
      readonly lastName?: string | null
      readonly email?: string | null
      readonly phoneNumber?: string | null
      readonly phoneNumberRegion?: string | null
      readonly contactTypes: readonly string[]
    }[] | null
  } | null
}

/** Synthetic backend DTO; each test overrides rather than mutating shared defaults. */
export function organizationWire(overrides: Partial<OrganizationWire> = {}): OrganizationWire {
  return {
    tenantId: 7, enabledInTenant: true, tenantLogo: null,
    organization: { id: 7, name: "Sample Organization", shortOrganizationName: null, type: ["Lab"], personContacts: [] },
    ...overrides,
  }
}

/** The platform's custom PageImpl uses data/pageNumber/lastPage, not Spring content/last. */
export function organizationsPage(data: readonly unknown[] = [], options: { readonly pageNumber?: number; readonly totalElements?: number; readonly totalPages?: number } = {}) {
  const pageNumber = options.pageNumber ?? 0
  const totalElements = options.totalElements ?? data.length
  const totalPages = options.totalPages ?? Math.ceil(totalElements / 12)
  return { data, pageNumber, pageSize: 12, offset: pageNumber * 12, emptyPage: data.length === 0,
    firstPage: pageNumber === 0, lastPage: pageNumber + 1 >= totalPages, numberOfElements: data.length, totalElements, totalPages }
}

/** Protected images default to the supported silent initials fallback; override per test. */
export async function mockOrganizationLogoFallback(page: Page): Promise<void> {
  await page.route("**/api/pp/org-logo/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ errorCode: "NO_LOGO", source: "proxy" }) }))
}

/** `GET v2/user/organization/portal` (Story 10.1). */
export async function mockOrganizations(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/user/organization/portal?**", {
    status: answer.status ?? 200,
    body: answer.body ?? organizationsPage(),
  })
}
