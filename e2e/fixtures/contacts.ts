import type { Page } from "@playwright/test"
import { json } from "./core"

/** Contact Point mocks (header, Epic 3 Contacts incl. Social Media, `/account` pickers). Epic 3 adds its write mocks here. */

export type ContactType = "Email" | "Mobile" | "Landline" | "Social Media"

export type ContactAnswer = readonly Record<string, unknown>[] | { readonly status: number; readonly body: unknown }

/** Mocks the contact-point list per type (a type left out answers `[]`); returns the types requested, in order. */
export async function mockContacts(page: Page, byType: Partial<Record<ContactType, ContactAnswer>> = {}): Promise<string[]> {
  const seen: string[] = []
  await page.route("**/api/1h/v2/user/contact-point/list?**", (route) => {
    const type = new URL(route.request().url()).searchParams.get("type") as ContactType
    seen.push(type)
    const answer = byType[type] ?? []
    return "status" in answer ? json(route, answer.status, answer.body) : json(route, 200, answer)
  })
  return seen
}
