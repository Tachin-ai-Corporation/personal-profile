import { deflateSync, crc32 } from "node:zlib"
import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import {
  expectHeaderTabOrder,
  mockAccountDefaults,
  mockHeaderPicture,
  mockPictureDelete,
  mockPictureIdFrom,
  mockPictureUpload,
  mockProfileDefaults,
  setTheme,
  signIn,
  test,
  type PictureUpload,
} from "./fixtures"

/**
 * Story 1.10 (Team A): change the Profile Picture from the header on `/`.
 * Real-browser re-encode through the dialog with test images built here (a
 * noisy PNG through zlib, a raw 24-bit BMP, a JPEG with an EXIF APP1 segment,
 * a corrupt `.png`), the uploaded body checked byte by byte, the replace →
 * delete order, the error states, the keyboard-only flow and axe. Every test
 * runs under the fail-fast `test` from `mockProfileDefaults`.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
const MB = 1024 * 1024
const UPLOAD_MAX = 4 * MB

interface TestFile {
  readonly name: string
  readonly mimeType: string
  readonly buffer: Buffer
}

/** Deterministic noise (xorshift), so the images compress badly and the same way every run. */
function noise(length: number, seed = 0x9e3779b9): Buffer {
  const out = Buffer.alloc(length)
  let x = seed >>> 0
  for (let i = 0; i < length; i++) {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    out[i] = x & 0xff
  }
  return out
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([length, typed, crc])
}

/** An RGB PNG of noise (filter 0 on every row), through zlib. */
function noisePng(width: number, height: number): Buffer {
  const pixels = noise(width * height * 3)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 1 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

/** A bottom-up 24-bit BMP of noise (rows padded to 4 bytes). */
function noiseBmp(width: number, height: number): Buffer {
  const row = Math.ceil((width * 3) / 4) * 4
  const header = Buffer.alloc(54)
  header.write("BM", 0, "ascii")
  header.writeUInt32LE(54 + row * height, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(row * height, 34)
  return Buffer.concat([header, noise(row * height, 0x1234567)])
}

/** An APP1 `Exif` segment (big-endian TIFF, one IFD with no entries) plus a GPS-like text marker. */
const EXIF_APP1 = (() => {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]), Buffer.from("GPS 37.7749N 122.4194W", "ascii")])
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2)
  return Buffer.concat([Buffer.from([0xff, 0xe1]), length, payload])
})()

/** Inserts the EXIF segment right after the JPEG's SOI. */
function withExif(jpeg: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), EXIF_APP1, jpeg.subarray(2)])
}

/** A real JPEG of noise from this browser's encoder (about 300 KB), as the base of the EXIF case. */
async function browserJpeg(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext("2d") as CanvasRenderingContext2D
      const image = context.createImageData(w, h)
      let x = 2463534242
      for (let i = 0; i < image.data.length; i++) {
        x ^= x << 13
        x ^= x >>> 17
        x ^= x << 5
        image.data[i] = i % 4 === 3 ? 255 : x & 0xff
      }
      context.putImageData(image, 0, 0)
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1]
    },
    [width, height] as const,
  )
  return Buffer.from(base64, "base64")
}

const avatarButton = (page: Page): Locator => page.getByRole("button", { name: "Change profile picture" })
const dialog = (page: Page): Locator => page.getByRole("dialog", { name: "Change profile picture" })
const saveButton = (page: Page): Locator => dialog(page).getByRole("button", { name: /^Sav/ })
/** The header avatar's image (the first one: the dialog's "Current picture" preview may show it too). */
const headerImage = (page: Page): Locator => page.locator('img[src*="/profile-picture/preview"]').first()

async function expectNoAxeViolations(page: Page, label: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme)
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
    expect(results.violations, `${label} (${theme})`).toEqual([])
  }
  await setTheme(page, "light")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

/** Every data request the page makes, in order, as `METHOD path` (image previews and contact reads left out). */
function recordRequests(page: Page): () => string[] {
  const seen: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (/^\/api\/(1h|pp)\//.test(url.pathname) && !url.pathname.includes("/preview") && !url.pathname.includes("contact-point")) {
      seen.push(`${request.method()} ${url.pathname}`)
    }
  })
  return () => [...seen]
}

/** The writes among `requests` (the header may re-read the picture id on focus). */
const writes = (requests: readonly string[]): string[] => requests.filter((entry) => !entry.startsWith("GET "))

const ID = "GET /api/pp/profile-picture-id"
const UPLOAD = "POST /api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload"

/** Opens `/` with a current picture (`current()`), ready to choose a file. */
async function openProfile(page: Page, picture: { current: number | null }): Promise<void> {
  await mockProfileDefaults(page)
  await mockHeaderPicture(page, picture.current ?? undefined)
  await mockPictureIdFrom(page, () => picture.current)
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
  await expect(avatarButton(page)).toBeVisible()
}

/** Chooses `file` through the avatar's native picker and waits for the dialog. */
async function choose(page: Page, file: TestFile, open: () => Promise<void> = () => avatarButton(page).click()): Promise<void> {
  const chooser = page.waitForEvent("filechooser")
  await open()
  await (await chooser).setFiles(file)
  await expect(dialog(page)).toBeVisible()
}

/** Asserts an uploaded body: one `file` part, a re-encoded JPEG ≤ 4 MB with no EXIF, not the original bytes. */
function expectReencodedJpeg(upload: PictureUpload, original: Buffer, fileName: string): void {
  expect(upload.parts).toBe(1)
  expect(upload.part).toBe("file")
  expect(upload.fileName).toBe(fileName)
  expect(upload.search).toBe("")
  expect([...upload.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  expect(upload.bytes.length).toBeLessThanOrEqual(UPLOAD_MAX)
  expect(upload.bytes.includes(Buffer.from("Exif", "ascii"))).toBe(false)
  expect(upload.bytes.includes(Buffer.from("GPS 37.7749N", "ascii"))).toBe(false)
  expect(upload.bytes.equals(original)).toBe(false)
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.describe("change the Profile Picture (Story 1.10)", () => {
  test("a 5.9 MB PNG is re-encoded to a JPEG ≤ 4 MB; replace → the new id → delete the old → the new avatar, toast, focus", async ({ page }) => {
    const picture = { current: 9001 as number | null }
    await openProfile(page, picture)
    const requests = recordRequests(page)
    const uploads = await mockPictureUpload(page, () => {
      picture.current = 9002
      return { body: { id: 9002 } }
    })
    const deleted = await mockPictureDelete(page)
    const png = noisePng(1440, 1430)
    expect(png.length).toBeGreaterThan(5.8 * MB)
    expect(png.length).toBeLessThanOrEqual(6 * MB)
    await choose(page, { name: "maria portrait.png", mimeType: "image/png", buffer: png })
    await expect(dialog(page).getByRole("img", { name: "Preview of your new profile picture" })).toBeVisible()
    await expect(dialog(page).getByText("maria portrait.png")).toBeVisible()
    await expect(dialog(page).getByText(/^PNG · 5\.\d MB$/)).toBeVisible()
    await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused()
    expect(await dialog(page).evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(440)

    await saveButton(page).click()
    await expect(dialog(page)).toBeHidden({ timeout: 30_000 })
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Profile picture saved.")).toBeVisible()
    await expect(avatarButton(page)).toBeFocused()
    await expect(headerImage(page)).toHaveAttribute("src", "/api/1h/v2/user/profile-picture/preview?v=9002")

    expect(uploads()).toHaveLength(1)
    expectReencodedJpeg(uploads()[0], png, "maria_portrait.jpg")
    expect(deleted()).toEqual(["9001"])
    const flow = requests().filter((entry) => entry === ID || entry === UPLOAD || entry.startsWith("DELETE"))
    const uploadAt = flow.indexOf(UPLOAD)
    // The new id is confirmed before the old picture is deleted.
    expect(flow.slice(uploadAt - 1, uploadAt + 3)).toEqual([ID, UPLOAD, ID, "DELETE /api/pp/file/9001"])
  })

  test("a 5.5 MB BMP is re-encoded to a JPEG ≤ 4 MB; the first picture deletes nothing", async ({ page }) => {
    const picture = { current: null as number | null }
    await openProfile(page, picture)
    const uploads = await mockPictureUpload(page, () => {
      picture.current = 9002
      return {}
    })
    const deleted = await mockPictureDelete(page)
    const bmp = noiseBmp(1380, 1390)
    expect(bmp.length).toBeGreaterThan(5.4 * MB)
    await choose(page, { name: "scan.bmp", mimeType: "image/bmp", buffer: bmp })
    await expect(dialog(page).getByText(/^BMP · 5\.\d MB$/)).toBeVisible()
    await saveButton(page).click()
    await expect(dialog(page)).toBeHidden({ timeout: 30_000 })
    expectReencodedJpeg(uploads()[0], bmp, "scan.jpg")
    expect(deleted()).toEqual([])
    await expect(headerImage(page)).toHaveAttribute("src", "/api/1h/v2/user/profile-picture/preview?v=9002")
  })

  test("a small JPEG with EXIF is re-encoded anyway: no Exif marker, different bytes (D-C)", async ({ page }) => {
    const picture = { current: 9001 as number | null }
    await openProfile(page, picture)
    const uploads = await mockPictureUpload(page, () => {
      picture.current = 9002
      return {}
    })
    await mockPictureDelete(page)
    const jpeg = withExif(await browserJpeg(page, 360, 360))
    expect(jpeg.includes(Buffer.from("Exif\0\0", "binary"))).toBe(true)
    expect(jpeg.length).toBeGreaterThan(100 * 1024)
    await choose(page, { name: "phone-photo.jpg", mimeType: "image/jpeg", buffer: jpeg })
    await saveButton(page).click()
    await expect(dialog(page)).toBeHidden({ timeout: 30_000 })
    expectReencodedJpeg(uploads()[0], jpeg, "phone-photo.jpg")
  })

  test("Cancel and Escape close with no request and focus the avatar; a cancelled picker focuses the avatar", async ({ page }) => {
    await openProfile(page, { current: 9001 })
    const requests = recordRequests(page)
    const file = { name: "a.png", mimeType: "image/png", buffer: noisePng(64, 64) }
    await choose(page, file)
    await dialog(page).getByRole("button", { name: "Cancel" }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(avatarButton(page)).toBeFocused()
    await choose(page, file)
    await page.keyboard.press("Escape")
    await expect(dialog(page)).toBeHidden()
    await expect(avatarButton(page)).toBeFocused()
    expect(writes(requests())).toEqual([])
    // The native picker's Cancel fires `cancel` on the input: no dialog, focus on the avatar.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.getByTestId("avatar-picture-input").dispatchEvent("cancel")
    await expect(avatarButton(page)).toBeFocused()
    await expect(dialog(page)).toBeHidden()
  })

  test("a file over 6 MB keeps the current picture, names the file and size, and Save sends nothing", async ({ page }) => {
    await openProfile(page, { current: 9001 })
    const requests = recordRequests(page)
    await choose(page, { name: "maria-portrait.bmp", mimeType: "image/bmp", buffer: Buffer.alloc(Math.round(9.2 * MB) - 1, 0x42) })
    await expect(dialog(page).getByText("Current picture", { exact: true })).toBeVisible()
    await expect(dialog(page).getByText("Not changed")).toBeVisible()
    const line = dialog(page).getByText("maria-portrait.bmp is 9.2 MB. Choose a file up to 6 MB.")
    await expect(line).toBeVisible()
    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true")
    const errorId = await line.evaluate((el) => el.closest("[data-slot='field-error']")?.id)
    await expect(saveButton(page)).toHaveAttribute("aria-describedby", errorId as string)
    await saveButton(page).click({ force: true })
    await page.waitForTimeout(300)
    expect(writes(requests())).toEqual([])
    await expectNoAxeViolations(page, "too-large dialog")
  })

  for (const [label, file] of [
    ["a GIF", { name: "anim.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a\x01\x00\x01\x00", "binary") }],
    ["an SVG", { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }],
    ["a PDF", { name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }],
    ["a corrupt .png", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not a png at all") }],
  ] as const) {
    test(`${label} shows the wrong-type line; Save is aria-disabled`, async ({ page }) => {
      await openProfile(page, { current: 9001 })
      const requests = recordRequests(page)
      await choose(page, file)
      await expect(dialog(page).getByText(`${file.name} isn't a JPG, PNG or BMP. Choose another file.`)).toBeVisible()
      await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true")
      await saveButton(page).click({ force: true })
      await page.waitForTimeout(300)
      expect(writes(requests())).toEqual([])
    })
  }

  test("Choose another file re-evaluates the new file", async ({ page }) => {
    await openProfile(page, { current: 9001 })
    await choose(page, { name: "anim.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") })
    await choose(page, { name: "ok.png", mimeType: "image/png", buffer: noisePng(80, 80) }, () => dialog(page).getByRole("button", { name: "Choose another file" }).click())
    await expect(dialog(page).getByRole("img", { name: "Preview of your new profile picture" })).toBeVisible()
    await expect(saveButton(page)).not.toHaveAttribute("aria-disabled", "true")
  })

  test("a 413 keeps the dialog with the uploadRejected line; no delete; the avatar is unchanged", async ({ page }) => {
    await openProfile(page, { current: 9001 })
    await mockPictureUpload(page, { status: 413, body: { errorCode: "TOO_LARGE", source: "proxy" } })
    const deleted = await mockPictureDelete(page)
    await choose(page, { name: "maria.png", mimeType: "image/png", buffer: noisePng(120, 120) })
    await saveButton(page).click()
    await expect(dialog(page).getByText("maria.png couldn't be used. Choose another file.")).toBeVisible()
    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true")
    expect(deleted()).toEqual([])
    await expect(headerImage(page)).toHaveAttribute("src", "/api/1h/v2/user/profile-picture/preview?v=9001")
  })

  test("a network failure shows the connection line; Retry re-sends the same re-encoded bytes", async ({ page }) => {
    const picture = { current: 9001 as number | null }
    await openProfile(page, picture)
    const uploads = await mockPictureUpload(page, (attempt) => {
      if (attempt === 1) return "abort"
      picture.current = 9002
      return {}
    })
    const deleted = await mockPictureDelete(page)
    await choose(page, { name: "a.png", mimeType: "image/png", buffer: noisePng(200, 200) })
    await saveButton(page).click()
    await expect(dialog(page).getByText("Couldn't save your profile picture. Check your connection.")).toBeVisible()
    expect(deleted()).toEqual([])
    await dialog(page).getByRole("button", { name: "Retry" }).click()
    await expect(dialog(page)).toBeHidden()
    expect(uploads()).toHaveLength(2)
    expect(uploads()[1].bytes.equals(uploads()[0].bytes)).toBe(true)
    expect(deleted()).toEqual(["9001"])
  })

  test("keyboard only: Tab to the avatar, Enter opens the picker, Save, focus back on the avatar", async ({ page }) => {
    const picture = { current: 9001 as number | null }
    await openProfile(page, picture)
    await mockPictureUpload(page, () => {
      picture.current = 9002
      return {}
    })
    await mockPictureDelete(page)
    const stops = await expectHeaderTabOrder(page)
    expect(stops).toContain("button:Change profile picture")
    await page.keyboard.press("Shift+Tab")
    await expect(avatarButton(page)).toBeFocused()
    await choose(page, { name: "kb.png", mimeType: "image/png", buffer: noisePng(100, 100) }, () => page.keyboard.press("Enter"))
    await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(saveButton(page)).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog(page)).toBeHidden()
    await expect(avatarButton(page)).toBeFocused()
    await expect(page.getByRole("region", { name: /Notifications/ }).getByText("Profile picture saved.")).toBeVisible()
    // Space opens the picker too.
    const chooser = page.waitForEvent("filechooser")
    await page.keyboard.press("Space")
    await chooser
  })

  test("axe light and dark with the dialog open; 44 px avatar target; no horizontal scroll", async ({ page }) => {
    await openProfile(page, { current: 9001 })
    const box = await avatarButton(page).boundingBox()
    expect([box?.width, box?.height]).toEqual([44, 44])
    await expectNoAxeViolations(page, "/ header with the avatar button")
    await choose(page, { name: "a.png", mimeType: "image/png", buffer: noisePng(64, 64) })
    await expect(dialog(page).getByRole("img", { name: "Preview of your new profile picture" })).toBeVisible()
    await expectNoAxeViolations(page, "change picture dialog")
    await expectNoHorizontalScroll(page)
  })

  test("/account has no avatar button and no header Tab stop", async ({ page }) => {
    await mockAccountDefaults(page)
    await mockHeaderPicture(page)
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 1, name: "Ann Lee" })).toBeVisible()
    await expect(avatarButton(page)).toHaveCount(0)
    await expect(page.getByTestId("avatar-picture-input")).toHaveCount(0)
    await expectHeaderTabOrder(page)
  })
})
