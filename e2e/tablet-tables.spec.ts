import { expect, type Locator, type Page } from "@playwright/test"
import {
  ACCOUNT_SETTINGS_MYSELF,
  ANN,
  CONTACT_PHONES,
  REGISTERED_PROVIDER_NPI,
  PERSONAL_FULL_MYSELF,
  addressRow,
  contactPointRow,
  insurancePage,
  insurancePolicy,
  mockAccountDefaults,
  mockAddresses,
  mockContacts,
  mockFileDownload,
  mockInsurance,
  mockInsuranceCard,
  mockMyself,
  mockProfileDefaults,
  mockUserNpi,
  setTheme,
  signIn,
  test,
} from "./fixtures"

/**
 * The shared tables at tablet widths (foundation; #63 review, Daniel's two
 * P2s): `SectionTable` and `KeyValueTable` must stay readable wherever they
 * sit, not only keep the document from scrolling sideways. Each table on the
 * page is measured in both themes: no column narrower than
 * `MIN_COLUMN_PX`, no text leaving its cell or crossing another cell's text,
 * and no short word broken across lines.
 */

const WIDTHS = [640, 768, 820, 1024] as const
const MIN_COLUMN_PX = 64
/** Words up to this length never break mid-word (long emails and URLs may). */
const SHORT_WORD = 12

/**
 * The readability problems of every table under `scope` (empty when all are
 * readable): narrow columns (table layout), text outside its cell, text over
 * another cell's text, and short words split across lines.
 */
async function tableProblems(scope: Locator): Promise<string[]> {
  return scope.evaluate(
    (root, { minColumn, shortWord }) => {
      const problems: string[] = []
      const tables = root.querySelectorAll<HTMLElement>("[data-slot='section-table'], [data-slot='key-value-table']")
      const visible = (element: Element): boolean => {
        if (element.closest(".sr-only")) return false
        const style = getComputedStyle(element)
        return style.visibility !== "hidden" && style.display !== "none"
      }
      const label = (text: string): string => JSON.stringify(text.trim().slice(0, 32))
      for (const table of tables) {
        const name = table.getAttribute("aria-labelledby") ?? "table"
        // Column widths: the header cells of a Section table, the first row's cells of a key/value table.
        const cells =
          table.dataset.slot === "section-table"
            ? [...table.querySelectorAll<HTMLElement>("thead th")].filter((th) => (th.textContent ?? "").trim() !== "" && !th.querySelector(".sr-only"))
            : [...(table.querySelector("tr")?.children ?? [])].filter((cell): cell is HTMLElement => (cell.textContent ?? "").trim() !== "")
        for (const cell of cells) {
          const width = cell.getBoundingClientRect().width
          if (width < minColumn) problems.push(`${name}: column ${label(cell.textContent ?? "")} is ${width.toFixed(1)} px`)
        }

        // Every visible text's line boxes, with the cell it belongs to.
        const texts: { readonly text: string; readonly cell: Element; readonly rects: DOMRect[] }[] = []
        const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.textContent ?? ""
          const parent = node.parentElement
          if (value.trim() === "" || !parent || !visible(parent)) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
          const cell = parent.closest("th, td, [data-column], [data-slot='row-actions-cell']") ?? table
          texts.push({ text: value, cell, rects })

          // A short word on more than one line: one-letter-per-line wrapping.
          for (const match of value.matchAll(/\S+/g)) {
            if (match[0].length > shortWord) continue
            const word = document.createRange()
            word.setStart(node, match.index)
            word.setEnd(node, match.index + match[0].length)
            const lines = new Set([...word.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))
            if (lines.size > 1) problems.push(`${name}: ${label(match[0])} breaks over ${lines.size} lines`)
          }
        }

        for (const { text, cell, rects } of texts) {
          if (cell === table || !cell.matches("th, td")) continue
          const box = cell.getBoundingClientRect()
          for (const rect of rects) {
            const out = Math.max(box.left - rect.left, rect.right - box.right)
            if (out > 1) problems.push(`${name}: ${label(text)} leaves its cell by ${out.toFixed(1)} px`)
          }
        }
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            if (texts[i].cell === texts[j].cell) continue
            for (const a of texts[i].rects) {
              for (const b of texts[j].rects) {
                const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
                const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
                if (x > 1 && y > 1) problems.push(`${name}: ${label(texts[i].text)} overlaps ${label(texts[j].text)} by ${x.toFixed(1)} px`)
              }
            }
          }
        }
      }
      return [...new Set(problems)]
    },
    { minColumn: MIN_COLUMN_PX, shortWord: SHORT_WORD },
  )
}

/** Measures every table in `scope` in both themes, at the current viewport. */
async function expectReadable(page: Page, scope: Locator, what: string): Promise<void> {
  await expect(scope.locator("[data-slot='section-table'], [data-slot='key-value-table']").first()).toBeVisible()
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    expect(await tableProblems(scope), `${what} (${theme})`).toEqual([])
  }
}

/** The Contacts tab: Personal information (key/value) and the four Section tables, every column filled. */
async function openContacts(page: Page): Promise<void> {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: PERSONAL_FULL_MYSELF })
  await mockFileDownload(page)
  await mockContacts(page, {
    ...CONTACT_PHONES,
    Email: [
      contactPointRow({ id: 31, value: "ann.lee@example.com", type: "Email", label: "Primary", isNotificationEnabled: true, phoneNumberRegion: null }),
      contactPointRow({ id: 32, value: "ann.lee.work@example.com", type: "Email", label: "Work", isVerified: false, phoneNumberRegion: null }),
    ],
    "Social Media": [contactPointRow({ id: 41, value: "https://www.linkedin.com/in/ann-lee", type: "Social Media", label: "Personal", isVerified: null, phoneNumberRegion: null })],
  })
  await mockAddresses(page, [
    addressRow({ id: 1, primary: true, validated: true }),
    addressRow({ id: 2, personLocationType: "Work", addressLine1: "500 Market Street", addressLine2: "Suite 1200", cityName: "San Francisco" }),
  ])
  await page.goto("/?tab=contacts")
  await expect(page.locator("#phone [data-slot='section-table']")).toBeVisible()
  await expect(page.locator("#addresses [data-slot='section-table']")).toBeVisible()
}

async function openInsurance(page: Page): Promise<void> {
  await mockProfileDefaults(page)
  await mockMyself(page, { body: { ...ANN, firstName: "Avery" } })
  await mockInsuranceCard(page)
  await mockInsurance(page, {
    body: insurancePage([
      insurancePolicy(),
      insurancePolicy({
        id: 56,
        insuranceType: "DENTAL",
        insurancePrecedence: "SECONDARY",
        insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental" },
        frontSideCardFile: null,
        backSideCardFile: null,
      }),
    ]),
  })
  await page.goto("/?tab=insurance")
  await expect(page.locator("[data-slot='insurance-card'] [data-slot='key-value-table']").first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("shared tables at tablet widths (#63 review)", () => {
  for (const width of WIDTHS) {
    test.describe(`${width} px`, () => {
      test.beforeEach(async ({ page, isMobile }) => {
        test.skip(isMobile, "these widths are set per test; the 360 px layout is covered by the Section specs")
        await page.setViewportSize({ width, height: 1000 })
      })

      test("Contacts: Personal information and every Section table, read view", async ({ page }) => {
        await openContacts(page)
        await expectReadable(page, page.getByRole("tabpanel"), "contacts read")
      })

      test("Contacts: Phone edit view", async ({ page }) => {
        await openContacts(page)
        await page.locator("#phone").getByRole("button", { name: "Edit", exact: true }).click()
        await expect(page.locator("#phone [data-slot='section-container'][data-editing='true']")).toBeVisible()
        await expectReadable(page, page.locator("#phone"), "phone edit")
      })

      test("Insurance: the policy cards' key/value grids", async ({ page }) => {
        await openInsurance(page)
        await expectReadable(page, page.getByRole("tabpanel"), "insurance")
      })

      // The pages the design refresh opts in everywhere (one accent colour): the 4 px container bar must not cost readability.
      test("/account Personal Account: the settings key/value grid in its accented container", async ({ page }) => {
        await mockAccountDefaults(page)
        await mockMyself(page, { body: ACCOUNT_SETTINGS_MYSELF })
        await page.goto("/account")
        await expect(page.locator('#account [data-slot="section-container"]')).toBeVisible()
        await expectReadable(page, page.getByRole("main"), "account settings")
      })

      test("/account Individual Provider Registration: the registered view's key/value grid", async ({ page }) => {
        await mockAccountDefaults(page)
        await mockUserNpi(page, { body: REGISTERED_PROVIDER_NPI })
        await page.goto("/account?tab=provider")
        await expect(page.locator('#provider [data-slot="section-container"]')).toBeVisible()
        await expectReadable(page, page.getByRole("main"), "provider registered")
      })

      test("Medical: no shared tables yet (Epic 6 placeholder), and no horizontal overflow", async ({ page }) => {
        await mockProfileDefaults(page)
        await page.goto("/?tab=medical")
        await expect(page.getByRole("tab", { name: /Medical/, selected: true })).toBeVisible()
        await expect(page.getByRole("tabpanel").locator("[data-slot='section-table'], [data-slot='key-value-table']")).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      })
    })
  }
})
