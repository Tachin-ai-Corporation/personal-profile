import type { Locator, Page } from "@playwright/test"
import type { LiveApi } from "./live-auth"
import { expect, sectionByHeading, test as liveTest, toastWith } from "./fixtures"

/**
 * Live, reversible writes against 1health dev (`LIVE_ALLOW_WRITES=1` only,
 * desktop only). Each test snapshots what it touches, adds an item through
 * the real UI and BFF, confirms the dev API stored it, deletes it again
 * through the UI, and finally checks the account is exactly as before. A
 * `finally` deletes leftovers through the API, so a failing step never leaves
 * test data behind.
 *
 * Insurance runs only with `LIVE_ALLOW_SOFT_DELETE=1`: its delete may only
 * label the policy "Deleted". Out on purpose (they reach real people or can't
 * be undone cleanly): email and phone (real verification emails and SMS),
 * MFA, signature and picture uploads, provider registration, edits of
 * existing values.
 */

const STAMP = Date.now()

/**
 * `cleanup(fn)` registers an undo that runs in the fixture's teardown: it
 * still runs when the test body times out or fails half-way (a `finally` in
 * the body would not run after a timeout).
 */
const test = liveTest.extend<{ cleanup: (undo: () => Promise<void>) => void }>({
  cleanup: async ({}, provide) => {
    const undos: (() => Promise<void>)[] = []
    await provide((undo) => undos.push(undo))
    for (const undo of undos.reverse()) await undo()
  },
})

interface Identified {
  readonly id: number
}

/** A list answer as a bare array or a page (`data` / `content`). */
async function rows<T>(api: LiveApi, path: string, params: Record<string, string>): Promise<T[]> {
  const response = await api.get(path, { params })
  expect(response.ok(), `GET ${path} answered ${response.status()}`).toBe(true)
  const body = (await response.json()) as T[] | { data?: T[]; content?: T[] }
  return Array.isArray(body) ? body : (body.data ?? body.content ?? [])
}

const ids = (list: readonly Identified[]): number[] => list.map((row) => row.id).sort((a, b) => a - b)

const footer = (section: Locator): Locator => section.locator('[data-slot="section-footer"]')

async function saveSection(section: Locator): Promise<void> {
  await footer(section).getByRole("button", { name: "Save" }).click()
  await expect(footer(section)).toHaveCount(0, { timeout: 20_000 })
}

async function pick(page: Page, trigger: Locator, option: string): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

async function kebab(page: Page, section: Locator, name: string, item: string): Promise<void> {
  await section.getByRole("button", { name: `More actions for ${name}` }).click()
  await page.getByRole("menuitem", { name: item, exact: true }).click()
}

test.describe("Reversible writes on dev (the account ends as it started)", () => {
  test.skip(({ live }) => !live.allowWrites, "Set LIVE_ALLOW_WRITES=1 to run writes against the dev account.")
  test.skip(({ isMobile }) => isMobile, "Writes run once, on desktop.")
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test("Social media: add a link → stored → removed → the links are as before", async ({ page, liveLaunch, upstream, cleanup }) => {
    interface Social extends Identified {
      readonly value?: string | null
    }
    const list = () => rows<Social>(upstream, "v2/user/contact-point/list", { type: "Social Media" })
    const link = `https://example.com/e2e-live-${STAMP}`
    const before = ids(await list())
    cleanup(async () => {
      const leftovers = (await list()).filter((row) => row.value === link).map((row) => row.id)
      if (leftovers.length > 0) {
        await upstream.post("v2/health/contact-point", { data: { contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: leftovers } })
      }
      expect(ids(await list()), "Social media is back as it was").toEqual(before)
    })

    await liveLaunch()
    const section = sectionByHeading(page, "Social media")
    await section.getByRole("button", { name: "Add link" }).first().click()
    await section.locator('[data-state="new"]').last().getByRole("textbox", { name: "Link" }).fill(link)
    await saveSection(section)
    await expect(toastWith(page, "Social media saved.")).toBeVisible()
    await expect(section.getByRole("link", { name: link })).toBeVisible()
    expect((await list()).some((row) => row.value === link), "dev stores the new link").toBe(true)

    await kebab(page, section, link, "Remove")
    await saveSection(section)
    await expect(section.getByRole("link", { name: link })).toHaveCount(0)
    expect((await list()).some((row) => row.value === link), "dev no longer has the link").toBe(false)
  })

  test("Addresses: add a non-primary one → stored → removed → the addresses are as before", async ({ page, liveLaunch, upstream, cleanup }) => {
    interface Address extends Identified {
      readonly addressLine1?: string | null
      readonly active?: boolean | null
    }
    // Deletes are soft (`active: false`), as the app reads them.
    const list = async () => (await rows<Address>(upstream, "v2/person/location/list", { page: "0", size: "100" })).filter((address) => address.active !== false)
    const line1 = `${STAMP} E2E Live St`
    const before = await list()
    // The first address of an account becomes its Primary, and the backend never deletes a Primary
    // (PersonLocationFactory: "first set another Location as the primary one"): it could not be undone.
    test.skip(before.length === 0, "The account has no address: a first one would become a Primary that can't be deleted.")
    cleanup(async () => {
      for (const address of await list()) {
        if (address.addressLine1 === line1) await upstream.delete(`v2/person/location/${address.id}`)
      }
      expect(ids(await list()), "Addresses are back as they were").toEqual(ids(before))
    })

    await liveLaunch()
    const section = sectionByHeading(page, "Addresses")
    await section.getByRole("button", { name: "Add address" }).first().click()
    const row = section.locator('[data-slot="address-expanded"]').first()
    await pick(page, row.getByRole("combobox", { name: "Address Type" }), "Other Work")
    await expect(row.getByRole("combobox", { name: "Country" })).toHaveText("United States")
    await expect(row.getByRole("checkbox", { name: "Set as primary" })).not.toBeChecked()
    await row.getByRole("combobox", { name: "Address line 1", exact: true }).fill(line1)
    await page.keyboard.press("Escape")
    await row.getByRole("textbox", { name: "City", exact: true }).fill("San Francisco")
    await row.getByRole("textbox", { name: "State/Province (optional)", exact: true }).fill("CA")
    await row.getByRole("textbox", { name: "Zip", exact: true }).fill("94105")
    await saveSection(section)
    await expect(toastWith(page, "Addresses saved.")).toBeVisible()
    const added = section.locator("tbody tr").filter({ hasText: line1 })
    await expect(added).toBeVisible()
    expect((await list()).some((address) => address.addressLine1 === line1), "dev stores the new address").toBe(true)

    await added.getByRole("button", { name: /^More actions for / }).click()
    await page.getByRole("menuitem", { name: "Remove", exact: true }).click()
    await expect(added).toHaveAttribute("data-state", "removed")
    await saveSection(section)
    await expect(section.getByText(line1)).toHaveCount(0)
    expect((await list()).some((address) => address.addressLine1 === line1), "dev no longer has the address").toBe(false)
  })

  test("Insurance: add a policy → stored → deleted → the policies are as before", async ({ page, liveLaunch, upstream, live, cleanup }) => {
    // DELETE v2/health/insurance/{id} may only label the policy "Deleted" (lib/api/insurance.ts), and the
    // app still shows it muted: the account would not end exactly as it started.
    test.skip(!live.allowSoftDelete, 'Insurance delete can be a soft delete: set LIVE_ALLOW_SOFT_DELETE=1 to accept a leftover "Deleted" policy.')
    interface Policy extends Identified {
      readonly memberId?: string | null
      readonly label?: string | null
    }
    // A soft-deleted policy stays listed with the label "Deleted"; only the active ones must match.
    const list = async () => (await rows<Policy>(upstream, "v2/health/patient/insurance", { page: "0", size: "100" })).filter((policy) => policy.label !== "Deleted")
    const memberId = `E2E${STAMP}`
    const before = ids(await list())
    cleanup(async () => {
      for (const policy of await list()) {
        if (policy.memberId === memberId) await upstream.delete(`v2/health/insurance/${policy.id}`)
      }
      expect(ids(await list()), "the active policies are back as they were").toEqual(before)
    })

    await liveLaunch()
    await page.getByRole("tab", { name: "Insurance" }).click()
    await expect(page).toHaveURL(/\?tab=insurance$/)
    const section = sectionByHeading(page, "Insurance")
    await section.locator('[data-slot="section-header"]').getByRole("button", { name: "Add insurance" }).click()
    const drawer = page.getByRole("dialog", { name: "Add insurance" })
    const field = (label: string): Locator => drawer.getByLabel(new RegExp(`^${label}( \\(optional\\))?$`)).first()
    await field("Insurer").fill("Blue")
    const insurer = page.getByRole("listbox").getByRole("option").first()
    await expect(insurer).toBeVisible({ timeout: 15_000 })
    await insurer.click()
    // Vision + "Other": no Primary, so no demote offer on an existing policy.
    await pick(page, field("Type"), "Vision")
    await pick(page, field("Precedence"), "Other")
    await pick(page, field("Relationship"), "Self")
    await field("Member ID").fill(memberId)
    await field("Effective date").fill("01012026")
    await drawer.getByRole("button", { name: "Save" }).click()
    await expect(drawer).toBeHidden({ timeout: 20_000 })
    await expect(toastWith(page, "Insurance saved.")).toBeVisible()
    expect((await list()).some((policy) => policy.memberId === memberId), "dev stores the new policy").toBe(true)

    const card = section.getByRole("article").filter({ hasText: memberId })
    await expect(card).toBeVisible()
    await card.getByRole("button", { name: /^More actions for / }).click()
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    const confirm = page.getByRole("alertdialog", { name: "Delete this insurance policy?" })
    await confirm.getByRole("button", { name: "Delete policy" }).click()
    await expect(confirm).toBeHidden()
    await expect(toastWith(page, "Insurance policy deleted.")).toBeVisible()
  })
})
