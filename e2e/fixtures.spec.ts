import { expect, test as base } from "@playwright/test"
import { failOnUnmockedProxy, mockAccountDefaults, mockProfileDefaults, mockProxy, signIn, test } from "./fixtures"

/** The shared e2e scaffolding itself (spec F6-3): defaults, `mockProxy` and the fail-fast catch-all. */

test("profile defaults answer every read of / (the fail-fast guard sees no unmocked call)", async ({ page }) => {
  await signIn(page)
  await mockProfileDefaults(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
})

test("mockProxy answers a glob with a fixed or computed answer and records the requests", async ({ page }) => {
  await signIn(page)
  await mockAccountDefaults(page)
  const typeKeys = await mockProxy(page, "v2/type/key/*", (request) => ({ body: { boKey: request.url().split("/").pop() } }))
  await page.goto("/auth")
  const answers = await page.evaluate(async () => {
    const one = await fetch("/api/1h/v2/type/key/Person").then((res) => res.json())
    const npi = await fetch("/api/1h/v2/user/npi").then((res) => res.status)
    const orgs = await fetch("/api/1h/v2/user/organization/portal?name=&page=0&size=12").then((res) => res.json())
    return { one, npi, orgs }
  })
  expect(answers).toEqual({ one: { boKey: "Person" }, npi: 404, orgs: expect.objectContaining({ content: [] }) })
  expect(typeKeys().map((request) => new URL(request.url()).pathname)).toEqual(["/api/1h/v2/type/key/Person"])
})

base("the catch-all answers 599 and names each unmocked proxy call", async ({ page }) => {
  const unmocked = await failOnUnmockedProxy(page)
  await page.goto("/auth")
  const status = await page.evaluate(async () => (await fetch("/api/1h/v2/not/mocked?x=1")).status)
  expect(status).toBe(599)
  expect(unmocked()).toEqual(["GET /api/1h/v2/not/mocked?x=1"])
})
