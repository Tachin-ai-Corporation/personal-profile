import AxeBuilder from "@axe-core/playwright"
import { expect, test as base } from "@playwright/test"
import {
  ANN,
  expectHeaderTabOrder,
  failOnUnmockedProxy,
  mockAccountDefaults,
  HEADER_TAB_STOPS,
  headerPageOf,
  mockFileDownload,
  mockHeaderPicture,
  mockProfileDefaults,
  mockProfilePicture,
  mockProfilePicturePreview,
  mockProxy,
  mockUserEdit,
  PNG_1X1,
  PROFILE_PICTURE_FILE_ID,
  signIn,
  test,
} from "./fixtures"

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

base("the catch-all answers 599 and names each unmocked /api/1h, /api/pp and /api/places call, popups included", async ({ page }) => {
  const unmocked = await failOnUnmockedProxy(page)
  await page.goto("/auth")
  const statuses = await page.evaluate(async () => [
    (await fetch("/api/1h/v2/not/mocked?x=1")).status,
    (await fetch("/api/pp/practice-support")).status,
    (await fetch("/api/places/autocomplete", { method: "POST", body: "{}" })).status,
  ])
  expect(statuses).toEqual([599, 599, 599])
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.evaluate(() => void window.open("/auth"))])
  await popup.waitForLoadState()
  expect(await popup.evaluate(async () => (await fetch("/api/pp/profile-picture-id")).status)).toBe(599)
  expect(unmocked()).toEqual([
    "GET /api/1h/v2/not/mocked?x=1",
    "GET /api/pp/practice-support",
    "POST /api/places/autocomplete",
    "GET /api/pp/profile-picture-id",
  ])
})

/* Spec F7-1: the frozen default user, the shared mocks and the header helpers. */

test("ANN is frozen with its documented values (override per test, never edit)", () => {
  expect(Object.isFrozen(ANN)).toBe(true)
  expect(ANN).toEqual({ id: 42, personId: 4242, firstName: "Ann", lastName: "Lee", username: "ann.lee" })
})

test("mockUserEdit records PUT bodies and answers ANN merged with the body; other methods fall through", async ({ page }) => {
  await signIn(page)
  await mockProxy(page, "v2/user/edit", { status: 405, body: { errorCode: "METHOD" } })
  const edits = await mockUserEdit(page)
  await page.goto("/auth")
  const answers = await page.evaluate(async () => {
    const put = await fetch("/api/1h/v2/user/edit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Bo" }) })
    const post = await fetch("/api/1h/v2/user/edit", { method: "POST", body: "{}" })
    return { put: [put.status, await put.json()], post: post.status }
  })
  expect(answers).toEqual({ put: [200, { ...ANN, firstName: "Bo" }], post: 405 })
  expect(edits()).toEqual([{ firstName: "Bo" }])
})

test("mockProfilePicture answers the picture id and the preview image (any v); mockFileDownload any answer per file id", async ({ page }) => {
  await signIn(page)
  const previews = await mockProfilePicture(page)
  const files = await mockFileDownload(page)
  const missing = await mockFileDownload(page, 7, { status: 404, contentType: "application/json", body: Buffer.from("{}") })
  await page.goto("/auth")
  const answers = await page.evaluate(async () => {
    const { fileId } = (await fetch("/api/pp/profile-picture-id").then((res) => res.json())) as { fileId: number }
    const preview = await fetch(`/api/1h/v2/user/profile-picture/preview?v=${fileId}`)
    const file = await fetch("/api/1h/v2/file/501/download")
    const gone = await fetch("/api/1h/v2/file/7/download")
    return { fileId, type: preview.headers.get("content-type"), bytes: (await preview.arrayBuffer()).byteLength, file: file.status, gone: gone.status }
  })
  expect(answers).toEqual({ fileId: PROFILE_PICTURE_FILE_ID, type: "image/png", bytes: PNG_1X1.length, file: 200, gone: 404 })
  expect(previews().map((request) => new URL(request.url()).search)).toEqual([`?v=${PROFILE_PICTURE_FILE_ID}`])
  expect(files()).toHaveLength(1)
  expect(missing()).toHaveLength(1)
})

test("mockProfilePicturePreview alone answers the preview with the given image", async ({ page }) => {
  await signIn(page)
  await mockProfilePicturePreview(page, { status: 404, contentType: "application/json", body: Buffer.from("{}") })
  await page.goto("/auth")
  expect(await page.evaluate(async () => (await fetch("/api/1h/v2/user/profile-picture/preview?v=1")).status)).toBe(404)
})

test("headerPageOf picks the header stops by URL", () => {
  expect(headerPageOf("https://localhost:3000/?tab=contacts")).toBe("profile")
  expect(headerPageOf("https://localhost:3000/test-fixtures/leave-guard")).toBe("profile")
  expect(headerPageOf("https://localhost:3000/account?tab=personal")).toBe("account")
  expect(headerPageOf("https://localhost:3000/accounts")).toBe("profile")
  expect(HEADER_TAB_STOPS.account).toEqual([])
})

test("expectHeaderTabOrder on /: app bar → header → the selected tab (with a header picture)", async ({ page }) => {
  await signIn(page)
  await mockProfileDefaults(page)
  await mockHeaderPicture(page)
  await page.goto("/?tab=insurance")
  await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  expect(await expectHeaderTabOrder(page)).toEqual(["a:Personal Profile", "a:Account", "a:Return to 1health", ...HEADER_TAB_STOPS.profile, "tab:Insurance"])
})

test("the Save all fixture page (spec NG-9027, for Story 1.14): the / frame, its participants registered, axe clean", async ({ page }) => {
  await signIn(page)
  await mockProfileDefaults(page)
  await page.goto("/test-fixtures/save-all?fail=email")
  await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  const dirty = page.getByTestId("dirty-count")
  await expect(dirty).toHaveText("0")
  await page.getByLabel("Fixture personal").fill("a")
  await page.getByLabel("Fixture phone").fill("b")
  await page.getByLabel("Fixture email").fill("c")
  await expect(dirty).toHaveText("3")
  // The guard-only participant is registered (it guards a leave) but never counted by Save all.
  await page.getByLabel("Fixture insurance").fill("d")
  await expect(dirty).toHaveText("3")
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  expect(results.violations).toEqual([])
  // `?fail=email` reaches its participant: the leave guard's Save runs them all, Email fails, the page stays.
  await page.getByRole("link", { name: "Account" }).click()
  const dialog = page.getByRole("alertdialog", { name: "You have unsaved changes" })
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId("fixture-email").locator("output")).toHaveText("not saved")
  for (const id of ["personal", "phone", "insurance"]) await expect(page.getByTestId(`fixture-${id}`).locator("output")).toHaveText("saved")
  await expect(dirty).toHaveText("1")
  await expect(page).toHaveURL(/\/test-fixtures\/save-all\?fail=email$/)
})
