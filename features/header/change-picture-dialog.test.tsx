import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import axe from "axe-core"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage, canDecodeImage } from "@/components/ui/image-reencode"
import { CurrentPageProvider } from "@/features/shell"
import { toastSuccess } from "@/features/shell/toasts"
import { sessionEvents } from "@/lib/api"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { TestProviders } from "@/test/providers"
import { ProfileHeader } from "."
import { PICTURE_PRELOAD_TIMEOUT_MS } from "./change-picture-dialog"
import { formatPictureFileSize, pictureFileType, PICTURE_ACCEPT, PICTURE_REENCODE } from "./picture-file"

/**
 * Story 1.10: the avatar button, the "Change profile picture" dialog and the
 * save flow, in jsdom. `reencodeImage` and `canDecodeImage` are stubbed here
 * (their algorithm is `components/ui/image-reencode.test.ts`; real encoding is
 * `e2e/profile-picture.spec.ts`); the requests go through MSW.
 */

vi.mock("@/components/ui/image-reencode", () => ({ reencodeImage: vi.fn(), canDecodeImage: vi.fn() }))
vi.mock("@/features/shell/toasts", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(() => ({ id: "t", dismiss: () => undefined })),
  toastPartial: vi.fn(),
}))

const MYSELF = "/api/1h/v2/user/myself"
const PICTURE_ID = "/api/pp/profile-picture-id"
const UPLOAD = "/api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload"
const DELETE = "/api/pp/file/:fileId"
const PREVIEW = "/api/1h/v2/user/profile-picture/preview"
const MB = 1024 * 1024

const ENCODED = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: "image/jpeg" })

/** Every data request, in order, as `METHOD path`. */
let log: string[]
/** The picture ids the named op answers, in turn (the last one repeats). */
let ids: (number | null)[]
let preloads: string[]
let objectUrls: string[]
let revoked: string[]

function pngOf(name: string, size: number, type = "image/png"): File {
  const file = new File([new Uint8Array(4)], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
}

function answerIds(...answers: (number | null)[]): void {
  ids = answers
  server.use(
    http.get(PICTURE_ID, () => {
      log.push("GET id")
      const fileId = ids.length > 1 ? ids.shift() : ids[0]
      return HttpResponse.json({ fileId })
    }),
  )
}

function answerUpload(answer: () => Response | Promise<Response> = () => HttpResponse.json({ id: 9002 })): void {
  server.use(
    http.post(UPLOAD, () => {
      log.push("POST upload")
      return answer()
    }),
  )
}

function answerDelete(status = 204): void {
  server.use(
    http.delete(DELETE, ({ params }) => {
      log.push(`DELETE ${String(params.fileId)}`)
      return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json({ errorCode: "NO_FILE", source: "proxy" }, { status })
    }),
  )
}

function setup(page: "profile" | "account" = "profile") {
  return render(
    <TestProviders>
      <CurrentPageProvider value={page}>
        <main>
          <ProfileHeader />
        </main>
      </CurrentPageProvider>
    </TestProviders>,
  )
}

const avatarButton = (): HTMLElement => screen.getByRole("button", { name: "Change profile picture" })
const headerImage = (container: HTMLElement): HTMLImageElement | null => container.querySelector("main img")
const dialog = (): HTMLElement => screen.getByRole("dialog", { name: "Change profile picture" })
const saveButton = (): HTMLElement => within(dialog()).getByRole("button", { name: /^Sav/ })
const cancelButton = (): HTMLElement => within(dialog()).getByRole("button", { name: "Cancel" })
const chooseAnother = (): HTMLElement => within(dialog()).getByRole("button", { name: "Choose another file" })

/** Picks `file` in the header's picker (as the native picker would) and waits for the dialog. */
async function pick(file: File): Promise<void> {
  fireEvent.change(screen.getByTestId("avatar-picture-input"), { target: { files: [file] } })
  await screen.findByRole("dialog", { name: "Change profile picture" })
}

async function openWith(file: File, { picture = 9001 }: { picture?: number | null } = {}): Promise<{ container: HTMLElement }> {
  answerIds(picture)
  const view = setup()
  await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
  await waitFor(() => expect(log).toContain("GET id"))
  log.length = 0
  await pick(file)
  return view
}

beforeEach(() => {
  log = []
  preloads = []
  objectUrls = []
  revoked = []
  stubViewport(360)
  server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, personId: 2, firstName: "Ann", lastName: "Lee", username: "ann.lee" })))
  server.use(http.get(PREVIEW, () => new HttpResponse(null, { status: 404 })))
  answerIds(9001)
  vi.mocked(canDecodeImage).mockResolvedValue(true)
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 800, height: 600 })
  let next = 0
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => {
      next += 1
      const url = `blob:preview-${next}`
      objectUrls.push(url)
      return url
    }),
  })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn((url: string) => revoked.push(url)) })
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        preloads.push(value)
        queueMicrotask(() => this.onload?.())
      }
    },
  )
})

afterEach(() => {
  document.documentElement.classList.remove("dark")
  Reflect.deleteProperty(URL, "createObjectURL")
  Reflect.deleteProperty(URL, "revokeObjectURL")
})

describe("picture file rules", () => {
  it("accepts exactly the AC's picker types", () => {
    expect(PICTURE_ACCEPT).toBe("image/jpeg,image/png,image/bmp,.jpg,.jpeg,.png,.bmp")
    expect(PICTURE_REENCODE).toEqual({ format: "jpeg", maxBytes: 4 * MB, maxDims: { width: 4096, height: 4096 } })
  })

  it.each<[string, string, string | null]>([
    ["a.jpg", "image/jpeg", "JPG"],
    ["a.JPEG", "image/jpeg", "JPG"],
    ["a.png", "image/png", "PNG"],
    ["a.bmp", "image/bmp", "BMP"],
    ["a.bmp", "image/x-ms-bmp", "BMP"],
    ["a.bmp", "", "BMP"],
    ["a.jpg", "image/jpg", "JPG"],
    ["a.jpeg", "image/pjpeg", "JPG"],
    ["a.bmp", "image/x-bmp", "BMP"],
    ["a.bmp", "image/x-windows-bmp", "BMP"],
    ["a.png", "image/pjpeg", null],
    ["a.jpg", "image/x-bmp", null],
    ["a.png", "image/jpeg", null],
    ["a.gif", "image/gif", null],
    ["a.svg", "image/svg+xml", null],
    ["a.heic", "image/heic", null],
    ["a.pdf", "application/pdf", null],
    ["png", "image/png", null],
  ])("%s (%s) → %s", (name, type, expected) => {
    expect(pictureFileType({ name, type })).toBe(expected)
  })

  it("formats sizes rounded up: MB with one decimal, KB under 1 MB", () => {
    expect(formatPictureFileSize(2.4 * MB)).toBe("2.4 MB")
    expect(formatPictureFileSize(9.2 * MB)).toBe("9.2 MB")
    expect(formatPictureFileSize(6 * MB + 1)).toBe("6.1 MB")
    expect(formatPictureFileSize(MB)).toBe("1.0 MB")
    expect(formatPictureFileSize(300 * 1024)).toBe("300 KB")
    expect(formatPictureFileSize(1023 * 1024)).toBe("1023 KB")
    expect(formatPictureFileSize(1023 * 1024 + 1)).toBe("1.0 MB")
    expect(formatPictureFileSize(MB - 1)).toBe("1.0 MB")
    expect(formatPictureFileSize(0)).toBe("0 KB")
  })
})

describe("the avatar button (Story 1.10)", () => {
  it("on / the avatar is a 44 px button named 'Change profile picture' with the focus ring and the camera badge", async () => {
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const button = avatarButton()
    for (const name of ["size-11", "rounded-full", "focus-ring"]) expect(button.classList.contains(name)).toBe(true)
    expect(button.getAttribute("type")).toBe("button")
    const badge = button.querySelector("[data-slot='camera-badge']") as HTMLElement
    expect(badge.getAttribute("aria-hidden")).toBe("true")
    for (const name of ["bg-primary", "text-primary-foreground", "ring-2", "ring-card", "rounded-full"]) expect(badge.classList.contains(name)).toBe(true)
    expect(screen.getByText("AL")).toBeTruthy()
    const input = screen.getByTestId("avatar-picture-input") as HTMLInputElement
    expect(input.type).toBe("file")
    expect(input.accept).toBe(PICTURE_ACCEPT)
    expect(input.hidden).toBe(true)
  })

  it("keeps the camera badge with a picture", async () => {
    answerIds(9001)
    const { container } = setup()
    await waitFor(() => expect(headerImage(container)).not.toBeNull())
    fireEvent.load(headerImage(container) as HTMLImageElement)
    expect(avatarButton().contains(headerImage(container))).toBe(true)
    expect(avatarButton().querySelector("[data-slot='camera-badge']")).not.toBeNull()
  })

  it("on /account the avatar is not a button", async () => {
    setup("account")
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByTestId("avatar-picture-input")).toBeNull()
  })

  it("opens the native picker on click", async () => {
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)
    fireEvent.click(avatarButton())
    expect(click).toHaveBeenCalledTimes(1)
    expect(click.mock.contexts[0]).toBe(screen.getByTestId("avatar-picture-input"))
  })

  it("a cancelled picker opens no dialog and focuses the avatar", async () => {
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    const input = screen.getByTestId("avatar-picture-input")
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent(input, new Event("cancel"))
    expect(document.activeElement).toBe(avatarButton())
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.change(input, { target: { files: [] } })
    expect(document.activeElement).toBe(avatarButton())
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("the Change profile picture dialog (Story 1.10)", () => {
  it("a valid file: 96 px preview, name, 'PNG · 2.4 MB', rules, Save enabled, focus on Cancel; nothing sent", async () => {
    const file = pngOf("maria-2026.png", 2.4 * MB)
    await openWith(file)
    const preview = within(dialog()).getByRole("img", { name: "Preview of your new profile picture" })
    expect(preview.getAttribute("src")).toBe("blob:preview-1")
    for (const name of ["size-24", "rounded-full", "object-cover"]) expect(preview.classList.contains(name)).toBe(true)
    expect(within(dialog()).getByText("maria-2026.png").className).toContain("truncate")
    expect(within(dialog()).getByText("PNG · 2.4 MB")).toBeTruthy()
    expect(within(dialog()).getByText("JPG, PNG or BMP, up to 6 MB.")).toBeTruthy()
    expect(saveButton().getAttribute("aria-disabled")).toBeNull()
    expect(within(dialog()).queryByText("Current picture")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(cancelButton()))
    expect(dialog().className).toContain("max-w-[440px]")
    expect(vi.mocked(canDecodeImage)).toHaveBeenCalledWith(file)
    expect(log).toEqual([])
  })

  it("a file over 6 MB keeps the current picture, names the file and size, and Save points at the error and does nothing", async () => {
    await openWith(pngOf("maria-portrait.bmp", 9.2 * MB, "image/bmp"))
    expect(within(dialog()).getByText("Current picture")).toBeTruthy()
    expect(within(dialog()).getByText("Not changed")).toBeTruthy()
    expect(within(dialog()).queryByRole("img", { name: "Preview of your new profile picture" })).toBeNull()
    expect(within(dialog()).getByText("AL")).toBeTruthy()
    const line = within(dialog()).getByText("maria-portrait.bmp is 9.2 MB. Choose a file up to 6 MB.")
    const error = line.closest("[data-slot='field-error']") as HTMLElement
    expect(error.closest("[role='alert']")).not.toBeNull()
    expect(saveButton().getAttribute("aria-disabled")).toBe("true")
    expect(saveButton().getAttribute("aria-describedby")).toBe(error.id)
    fireEvent.click(saveButton())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(log).toEqual([])
    expect(reencodeImage).not.toHaveBeenCalled()
    expect(vi.mocked(canDecodeImage)).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it.each<[string, File, boolean]>([
    ["a GIF", pngOf("anim.gif", MB, "image/gif"), true],
    ["an SVG", pngOf("logo.svg", 1000, "image/svg+xml"), true],
    ["a HEIC", pngOf("photo.heic", MB, "image/heic"), true],
    ["a PDF", pngOf("scan.pdf", MB, "application/pdf"), true],
    ["a .png that doesn't decode", pngOf("broken.png", 1000), false],
  ])("%s shows the wrong-type line and Save is aria-disabled", async (_label, file, decodes) => {
    vi.mocked(canDecodeImage).mockResolvedValue(decodes)
    await openWith(file)
    const line = within(dialog()).getByText(`${file.name} isn't a JPG, PNG or BMP. Choose another file.`)
    expect(saveButton().getAttribute("aria-disabled")).toBe("true")
    expect(saveButton().getAttribute("aria-describedby")).toBe((line.closest("[data-slot='field-error']") as HTMLElement).id)
    expect(within(dialog()).getByText("Current picture")).toBeTruthy()
    fireEvent.click(saveButton())
    expect(log).toEqual([])
  })

  it("Choose another file re-evaluates; a cancelled picker keeps the state", async () => {
    await openWith(pngOf("big.png", 7 * MB))
    expect(within(dialog()).getByText("big.png is 7.0 MB. Choose a file up to 6 MB.")).toBeTruthy()
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)
    fireEvent.click(chooseAnother())
    expect(click.mock.contexts[0]).toBe(screen.getByTestId("change-picture-input"))
    // Cancelled: nothing changes.
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [] } })
    expect(within(dialog()).getByText("big.png is 7.0 MB. Choose a file up to 6 MB.")).toBeTruthy()
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("ok.jpg", 300 * 1024, "image/jpeg")] } })
    expect(await within(dialog()).findByText("JPG · 300 KB")).toBeTruthy()
    expect(within(dialog()).queryByText(/Choose a file up to 6 MB/)).toBeNull()
    expect(saveButton().getAttribute("aria-disabled")).toBeNull()
    // And back to an error: the previous preview URL is revoked.
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("x.gif", 10, "image/gif")] } })
    expect(await within(dialog()).findByText("x.gif isn't a JPG, PNG or BMP. Choose another file.")).toBeTruthy()
    expect(revoked).toEqual(["blob:preview-1"])
  })

  it.each([
    ["Cancel", () => fireEvent.click(cancelButton())],
    ["Escape", () => fireEvent.keyDown(dialog(), { key: "Escape" })],
    ["Close", () => fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }))],
  ])("%s closes with no request, revokes the preview and focuses the avatar", async (_label, dismiss) => {
    await openWith(pngOf("a.png", MB))
    dismiss()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(avatarButton()))
    expect(revoked).toEqual(["blob:preview-1"])
    expect(log).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("Save replaces the picture: re-encode, id, upload, delete the old, id, preload, avatar ?v=9002, toast, focus on the avatar", async () => {
    answerUpload()
    answerDelete()
    const append = vi.spyOn(FormData.prototype, "append")
    const file = pngOf("maria 2026.png", 5.9 * MB)
    const { container } = await openWith(file)
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(reencodeImage).toHaveBeenCalledWith(file, PICTURE_REENCODE)
    expect(log).toEqual(["GET id", "POST upload", "GET id", "DELETE 9001"])
    expect(append.mock.calls).toEqual([["file", ENCODED, "maria_2026.jpg"]])
    expect(preloads).toEqual([`${PREVIEW}?v=9002`])
    await waitFor(() => expect(headerImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9002`))
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
    await waitFor(() => expect(document.activeElement).toBe(avatarButton()))
    expect(revoked).toEqual(["blob:preview-1"])
    // The key was set, not refetched.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(log).toEqual(["GET id", "POST upload", "GET id", "DELETE 9001"])
  })

  it("the first picture deletes nothing", async () => {
    answerUpload()
    answerDelete()
    await openWith(pngOf("a.png", MB), { picture: null })
    answerIds(null, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(log).toEqual(["GET id", "POST upload", "GET id"])
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  it.each([404, 502])("a failed delete (%i) is still a success, with nothing shown", async (status) => {
    answerUpload()
    answerDelete(status)
    await openWith(pngOf("a.png", MB))
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(log).toEqual(["GET id", "POST upload", "GET id", "DELETE 9001"])
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("revalidates the id and deletes nothing when the read after the upload fails", async () => {
    answerUpload()
    answerDelete()
    await openWith(pngOf("a.png", MB))
    let reads = 0
    server.use(
      http.get(PICTURE_ID, () => {
        reads += 1
        log.push("GET id")
        if (reads === 1) return HttpResponse.json({ fileId: 9001 })
        if (reads === 2) return HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })
        return HttpResponse.json({ fileId: 9002 })
      }),
    )
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(log).toEqual(["GET id", "POST upload", "GET id", "GET id"]))
    expect(preloads).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  it.each([
    [413, "TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA"],
  ])("an upload rejected with %i keeps the dialog with the uploadRejected line; no delete; avatar unchanged", async (status, errorCode) => {
    answerUpload(() => HttpResponse.json({ errorCode, source: "proxy" }, { status }))
    answerDelete()
    const { container } = await openWith(pngOf("maria.png", MB))
    fireEvent.click(saveButton())
    const line = await within(dialog()).findByText("maria.png couldn't be used. Choose another file.")
    expect(log).toEqual(["GET id", "POST upload"])
    expect(saveButton().getAttribute("aria-disabled")).toBe("true")
    expect(saveButton().getAttribute("aria-describedby")).toBe((line.closest("[data-slot='field-error']") as HTMLElement).id)
    expect(within(dialog()).queryByRole("button", { name: "Retry" })).toBeNull()
    expect(within(dialog()).getByRole("img", { name: "Preview of your new profile picture" })).toBeTruthy()
    expect(headerImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9001`)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a re-encode that can't reach 4 MB shows the uploadRejected line and sends nothing", async () => {
    vi.mocked(reencodeImage).mockResolvedValue({ ok: false, reason: "TOO_LARGE" })
    await openWith(pngOf("huge.png", 5 * MB))
    fireEvent.click(saveButton())
    expect(await within(dialog()).findByText("huge.png couldn't be used. Choose another file.")).toBeTruthy()
    expect(log).toEqual([])
  })

  it.each<[string, () => Response]>([
    ["a network error", () => HttpResponse.error()],
    ["a 502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })],
    ["a 500", () => HttpResponse.json({ message: "boom" }, { status: 500 })],
  ])("%s shows the connection line with Retry, which re-runs with the same blob", async (_label, failure) => {
    let uploads = 0
    answerUpload(() => (++uploads === 1 ? failure() : HttpResponse.json({ id: 9002 })))
    answerDelete()
    await openWith(pngOf("a.png", MB))
    fireEvent.click(saveButton())
    expect(await within(dialog()).findByText("Couldn't save your profile picture. Check your connection.")).toBeTruthy()
    expect(log).toEqual(["GET id", "POST upload"])
    expect(saveButton().getAttribute("aria-disabled")).toBeNull()
    answerIds(9001, 9002)
    fireEvent.click(within(dialog()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(reencodeImage).toHaveBeenCalledTimes(1)
    expect(log).toEqual(["GET id", "POST upload", "GET id", "POST upload", "GET id", "DELETE 9001"])
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  it("a failed id read before the upload shows the connection line and uploads nothing", async () => {
    answerUpload()
    await openWith(pngOf("a.png", MB))
    server.use(http.get(PICTURE_ID, () => (log.push("GET id"), HttpResponse.error())))
    fireEvent.click(saveButton())
    expect(await within(dialog()).findByText("Couldn't save your profile picture. Check your connection.")).toBeTruthy()
    expect(log).toEqual(["GET id"])
  })

  const EXPIRED = (): Response => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })

  /** The picture id by read number (from 1); every read is logged. */
  function idReads(answer: (read: number) => Response): void {
    let reads = 0
    server.use(
      http.get(PICTURE_ID, () => {
        log.push("GET id")
        return answer(++reads)
      }),
    )
  }

  it.each<[string, () => void, string[]]>([
    ["the upload", () => answerUpload(EXPIRED), ["GET id", "POST upload"]],
    ["the id read before the upload", () => idReads(EXPIRED), ["GET id"]],
    [
      "the id read after the upload",
      () => (answerUpload(), idReads((read) => (read === 1 ? HttpResponse.json({ fileId: 9001 }) : EXPIRED()))),
      ["GET id", "POST upload", "GET id"],
    ],
    [
      "the delete",
      () => (answerUpload(), answerIds(9001, 9002), server.use(http.delete(DELETE, () => (log.push("DELETE 9001"), EXPIRED())))),
      ["GET id", "POST upload", "GET id", "DELETE 9001"],
    ],
  ])("SESSION_EXPIRED on %s closes the dialog with no error, no toast and no focus move", async (_label, arrange, requests) => {
    await openWith(pngOf("a.png", MB))
    arrange()
    const expired = vi.fn()
    const unsubscribe = sessionEvents.subscribe("session-expired", expired)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    unsubscribe()
    expect(expired).toHaveBeenCalledTimes(1)
    expect(log).toEqual(requests)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(screen.queryByRole("alert")).toBeNull()
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(document.activeElement).not.toBe(avatarButton())
  })

  it("deletes nothing when the new id is the old one (the upload didn't replace it)", async () => {
    answerUpload()
    answerDelete()
    await openWith(pngOf("a.png", MB))
    answerIds(9001)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(log).toEqual(["GET id", "POST upload", "GET id"])
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  it("a Retry after a lost upload response deletes the original picture and the lost upload's, never the new one", async () => {
    let uploads = 0
    let current = 9001
    // The first upload is stored (id 9002) but its answer is lost; the Retry's upload is 9003.
    answerUpload(() => {
      uploads += 1
      current = uploads === 1 ? 9002 : 9003
      return uploads === 1 ? HttpResponse.error() : HttpResponse.json({ id: current })
    })
    answerDelete()
    await openWith(pngOf("a.png", MB))
    idReads(() => HttpResponse.json({ fileId: current }))
    fireEvent.click(saveButton())
    await within(dialog()).findByText("Couldn't save your profile picture. Check your connection.")
    fireEvent.click(within(dialog()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(log).toEqual(["GET id", "POST upload", "GET id", "POST upload", "GET id", "DELETE 9001", "DELETE 9002"])
    expect(reencodeImage).toHaveBeenCalledTimes(1)
  })

  it.each<[string, () => Response]>([
    ["a 413", () => HttpResponse.json({ errorCode: "TOO_LARGE", source: "proxy" }, { status: 413 })],
    ["a 502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })],
  ])("after %s, another file clears the error and Save uploads the new file", async (_label, failure) => {
    let uploads = 0
    answerUpload(() => (++uploads === 1 ? failure() : HttpResponse.json({ id: 9002 })))
    answerDelete()
    const first = pngOf("first.png", MB)
    await openWith(first)
    fireEvent.click(saveButton())
    expect(await within(dialog()).findByText(/couldn't be used|Check your connection/)).toBeTruthy()
    expect(uploads).toBe(1)
    const second = pngOf("second.jpg", MB, "image/jpeg")
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [second] } })
    expect(await within(dialog()).findByText("second.jpg")).toBeTruthy()
    expect(within(dialog()).queryByText(/couldn't be used|Check your connection/)).toBeNull()
    expect(saveButton().getAttribute("aria-disabled")).toBeNull()
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(vi.mocked(reencodeImage).mock.calls.map(([file]) => file)).toEqual([first, second])
    expect(uploads).toBe(2)
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  /** A `canDecodeImage` answer the test resolves later. */
  function deferredDecode(): (decodes: boolean) => void {
    let resolve: (decodes: boolean) => void = () => undefined
    vi.mocked(canDecodeImage).mockImplementationOnce(() => new Promise<boolean>((done) => (resolve = done)))
    return (decodes) => resolve(decodes)
  }

  it("a pending evaluation after Cancel opens no dialog", async () => {
    await openWith(pngOf("a.png", MB))
    const resolve = deferredDecode()
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("late.png", MB)] } })
    fireEvent.click(cancelButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await act(async () => resolve(true))
    await act(async () => new Promise((done) => setTimeout(done, 10)))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(objectUrls).toEqual(["blob:preview-1"])
  })

  it("a slow evaluation resolving after a newer one never replaces it", async () => {
    await openWith(pngOf("a.png", MB))
    const resolveSlow = deferredDecode()
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("slow.png", MB)] } })
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("fast.png", MB)] } })
    expect(await within(dialog()).findByText("fast.png")).toBeTruthy()
    await act(async () => resolveSlow(true))
    await act(async () => new Promise((done) => setTimeout(done, 10)))
    expect(within(dialog()).getByText("fast.png")).toBeTruthy()
    expect(within(dialog()).queryByText("slow.png")).toBeNull()
  })

  it("an evaluation resolving during a save is ignored: the file being saved stays", async () => {
    let releaseEncode: () => void = () => undefined
    const encodeGate = new Promise<void>((done) => (releaseEncode = done))
    vi.mocked(reencodeImage).mockImplementation(async () => {
      await encodeGate
      return { ok: true, blob: ENCODED, width: 800, height: 600 }
    })
    answerUpload()
    answerDelete()
    const saved = pngOf("saved.png", MB)
    await openWith(saved)
    const resolveOther = deferredDecode()
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("other.png", MB)] } })
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(reencodeImage).toHaveBeenCalledTimes(1))
    await act(async () => resolveOther(true))
    await act(async () => new Promise((done) => setTimeout(done, 10)))
    expect(within(dialog()).getByText("saved.png")).toBeTruthy()
    expect(within(dialog()).queryByText("other.png")).toBeNull()
    expect(saveButton().getAttribute("aria-busy")).toBe("true")
    releaseEncode()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(vi.mocked(reencodeImage).mock.calls[0][0]).toBe(saved)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it("a preload that fails still sets the new id, closes, toasts and focuses the avatar", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(value: string) {
          preloads.push(value)
          queueMicrotask(() => this.onerror?.())
        }
      },
    )
    answerUpload()
    answerDelete()
    const { container } = await openWith(pngOf("a.png", MB))
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(preloads).toEqual([`${PREVIEW}?v=9002`])
    await waitFor(() => expect(headerImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9002`))
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
    await waitFor(() => expect(document.activeElement).toBe(avatarButton()))
  })

  it("a preload that never loads gives up after PICTURE_PRELOAD_TIMEOUT_MS", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(value: string) {
          preloads.push(value)
        }
      },
    )
    answerUpload()
    answerDelete()
    const { container } = await openWith(pngOf("a.png", MB))
    answerIds(9001, 9002)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      fireEvent.click(saveButton())
      // Real-time polling (setImmediate isn't faked), so the fake clock stays at the preload's start.
      for (let i = 0; preloads.length === 0 && i < 500; i++) await act(async () => new Promise((done) => setImmediate(done)))
      expect(preloads).toEqual([`${PREVIEW}?v=9002`])
      await act(async () => vi.advanceTimersByTimeAsync(PICTURE_PRELOAD_TIMEOUT_MS - 1))
      expect(screen.getByRole("dialog")).toBeTruthy()
      await act(async () => vi.advanceTimersByTimeAsync(1))
    } finally {
      vi.useRealTimers()
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(headerImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9002`))
    expect(toastSuccess).toHaveBeenCalledWith("Profile picture saved.")
  })

  it("while saving: Save busy 'Saving…', Cancel and Choose another inert, Escape does nothing", async () => {
    // Gated on the re-encode (MSW can't hold a multipart request open in jsdom).
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    vi.mocked(reencodeImage).mockImplementation(async () => {
      await gate
      return { ok: true, blob: ENCODED, width: 800, height: 600 }
    })
    answerUpload()
    answerDelete()
    await openWith(pngOf("a.png", MB))
    answerIds(9001, 9002)
    fireEvent.click(saveButton())
    await waitFor(() => expect(reencodeImage).toHaveBeenCalledTimes(1))
    expect(saveButton().getAttribute("aria-busy")).toBe("true")
    expect(saveButton().textContent).toBe("Saving…")
    expect(cancelButton().getAttribute("aria-disabled")).toBe("true")
    expect(chooseAnother().getAttribute("aria-disabled")).toBe("true")
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)
    fireEvent.click(chooseAnother())
    fireEvent.click(cancelButton())
    fireEvent.keyDown(dialog(), { key: "Escape" })
    fireEvent.click(saveButton())
    expect(click).not.toHaveBeenCalled()
    expect(dialog()).toBeTruthy()
    release()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(log.filter((entry) => entry === "POST upload")).toHaveLength(1)
  })

  it.each(["light", "dark"])("has no axe violations with a valid file and with an error (%s)", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    await openWith(pngOf("a.png", MB))
    const options = { rules: { "color-contrast": { enabled: false } } }
    expect((await axe.run(document.body, options)).violations).toEqual([])
    fireEvent.change(screen.getByTestId("change-picture-input"), { target: { files: [pngOf("big.png", 8 * MB)] } })
    await within(dialog()).findByText("big.png is 8.0 MB. Choose a file up to 6 MB.")
    expect((await axe.run(document.body, options)).violations).toEqual([])
  })
})
