import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage } from "@/components/ui/image-reencode"
import { fetchMyself, toMyself, type Myself } from "@/lib/api"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { toPersonalValues, type PersonalValues } from "./schema"
import { SIGNATURE_REENCODE } from "./signature-file"
import {
  personalSaveSteps,
  savedSignatureId,
  savePersonal,
  signatureChange,
  SIGNATURE_REMOVE_ROUNDS,
  type PendingSignature,
  type PersonalSaveInput,
} from "./signature-save"

/**
 * Story 2.4 (NG-9022): the Personal-information save steps (the PUT, then the
 * Signature: new, replace, remove), through MSW at the `/api` boundary.
 * `reencodeImage` is stubbed (its algorithm is `components/ui/image-reencode.test.ts`;
 * real encoding is `e2e/profile-personal.spec.ts`).
 */

vi.mock("@/components/ui/image-reencode", () => ({ reencodeImage: vi.fn() }))

const MYSELF = "/api/1h/v2/user/myself"
const EDIT = "/api/1h/v2/user/edit"
const UPLOAD = "/api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload"
const DELETE = "/api/pp/file/:fileId"
/** The parameters the client never sends (the proxy and the named op force them). */
const FORBIDDEN_PARAMS = /[?&](isPublic|current|hardDelete)=/i

const DRAWING = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
const UPLOADED = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" })
const ENCODED = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })

/**
 * The server: the caller's `PersonHasSignatureFile` relations, oldest first;
 * `myself.signature` is the newest. The delete mock is the named op's
 * ownership rule: it owns every relation in this list (the replaced old one
 * included) and answers 404 `NO_FILE` for anything else.
 */
let relations: number[]
/** Every write, in order, as `METHOD path` (deletes with their status), and every request URL (for the parameter check). */
let writes: string[]
let urls: string[]

const newest = (): number | null => relations.at(-1) ?? null
const myselfWith = (id: number | null): Myself => toMyself(myselfWire({ signature: id === null ? null : { id, name: "signature.png" } })) as Myself
const NO_FILE = () => HttpResponse.json({ errorCode: "NO_FILE", source: "proxy" }, { status: 404 })
const UPSTREAM_ERROR = () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })
const TOKEN_EXPIRED = () => HttpResponse.json({ errorCode: "TOKEN_EXPIRED", source: "proxy" }, { status: 401 })

/** `myself` from the relations; `answer(read)` overrides a read (1 = the D-A safeguard's read before the first write). */
function answerMyself(answer: (read: number) => Response | undefined = () => undefined): void {
  let reads = 0
  server.use(
    http.get(MYSELF, ({ request }) => {
      urls.push(request.url)
      reads += 1
      return answer(reads) ?? HttpResponse.json(myselfWire({ signature: newest() === null ? null : { id: newest(), name: "signature.png" } }))
    }),
  )
}

/** The upload: a success adds relation `newId` (`null`: the server keeps showing the old one). */
function answerUpload(answer: () => Response = () => HttpResponse.json({ id: 57 }), newId: number | null = 57): void {
  server.use(
    http.post(UPLOAD, ({ request }) => {
      urls.push(request.url)
      writes.push("POST upload")
      const response = answer()
      if (response.ok && newId !== null) relations.push(newId)
      return response
    }),
  )
}

/** The named op: owns the listed relations (204, removed), 404 `NO_FILE` otherwise; `failure` answers instead; `after` runs after a 204. */
function answerDelete({ failure, after }: { failure?: () => Response; after?: (id: number) => void } = {}): void {
  server.use(
    http.delete(DELETE, ({ request, params }) => {
      urls.push(request.url)
      const id = Number(params.fileId)
      let response: Response
      if (failure) response = failure()
      else if (relations.includes(id)) {
        relations = relations.filter((relation) => relation !== id)
        after?.(id)
        response = new HttpResponse(null, { status: 204 })
      } else response = NO_FILE()
      writes.push(`DELETE ${id} ${response.status}`)
      return response
    }),
  )
}

/** The token refresh ends the session (so a 401 `TOKEN_EXPIRED` becomes `SESSION_EXPIRED`). */
function refreshEndsSession(): void {
  server.use(http.post("/api/session/refresh", () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 })))
}

function answerEdit(answer: () => Response = () => HttpResponse.json(myselfWire())): void {
  server.use(
    http.put(EDIT, async ({ request }) => {
      urls.push(request.url)
      writes.push(`PUT ${JSON.stringify(await request.json())}`)
      return answer()
    }),
  )
}

interface Setup {
  readonly saved?: number | null
  readonly values?: Partial<PersonalValues>
  readonly pending?: PendingSignature
  readonly drawing?: Blob | null
}

function input({ saved = 41, values = {}, pending = { kind: "drawing" }, drawing = DRAWING }: Setup = {}) {
  const myself = myselfWith(saved)
  const baseline = toPersonalValues(myself)
  const refreshMyself = vi.fn<() => Promise<Myself | undefined>>(async () => myselfWith(newest()))
  const rebase = vi.fn()
  const exportDrawing = vi.fn(async () => drawing)
  const save: PersonalSaveInput = {
    values: { ...baseline, ...values },
    baseline,
    myself,
    pendingSignature: (key) => (key === 1 ? pending : undefined),
    exportDrawing,
    refreshMyself,
    rebase,
  }
  return { save, refreshMyself, rebase, exportDrawing }
}

beforeEach(async () => {
  relations = [41]
  writes = []
  urls = []
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 960, height: 320 })
  answerMyself()
  // A write goes out only for a loaded page user (D-A save safeguard): load `myself` first, as the page does.
  expect((await fetchMyself()).success).toBe(true)
})

describe("signatureChange", () => {
  it.each([
    ["saved", "saved", "none"],
    ["none", "none", "none"],
    ["new:1", "none", "upload"],
    ["new:2", "saved", "upload"],
    ["cleared", "saved", "remove"],
    ["cleared", "none", "none"],
    ["none", "saved", "none"],
  ] as const)("%s over %s → %s", (value, baseline, change) => {
    expect(signatureChange(value, baseline)).toBe(change)
  })

  it("the old id comes only from myself.signature (a positive integer)", () => {
    expect(savedSignatureId(myselfWith(41))).toBe(41)
    expect(savedSignatureId(myselfWith(null))).toBeNull()
    expect(savedSignatureId(undefined)).toBeNull()
  })
})

describe("savePersonal: new Signature (no saved one)", () => {
  beforeEach(() => {
    relations = []
  })

  it("draws: exports the pad, re-encodes it, uploads one PNG; no PUT, no delete; myself revalidated", async () => {
    answerUpload()
    answerDelete()
    const { save, refreshMyself, exportDrawing } = input({ saved: null, values: { signature: "new:1" } })
    expect(await savePersonal(save)).toEqual({ result: { ok: true }, failedParts: [] })
    expect(exportDrawing).toHaveBeenCalledTimes(1)
    expect(reencodeImage).toHaveBeenCalledTimes(1)
    expect(reencodeImage).toHaveBeenCalledWith(DRAWING, SIGNATURE_REENCODE)
    expect(writes).toEqual(["POST upload"])
    expect(relations).toEqual([57])
    expect(refreshMyself).toHaveBeenCalledTimes(1)
  })

  it("an upload: sends the pending blob as is (re-encoded once, when it was chosen), never the pad", async () => {
    answerUpload()
    const append = vi.spyOn(FormData.prototype, "append")
    const { save, exportDrawing } = input({ saved: null, values: { signature: "new:1" }, pending: { kind: "upload", blob: UPLOADED } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(exportDrawing).not.toHaveBeenCalled()
    expect(reencodeImage).not.toHaveBeenCalled()
    expect(append.mock.calls).toEqual([["file", UPLOADED, "signature.png"]])
    expect(writes).toEqual(["POST upload"])
  })

  it("the PUT runs first when other fields changed, then the upload", async () => {
    answerEdit()
    answerUpload()
    const { save } = input({ saved: null, values: { firstName: "Anna", signature: "new:1" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual(['PUT {"firstName":"Anna"}', "POST upload"])
  })
})

describe("savePersonal: replace", () => {
  it("uploads, re-reads myself (now 57) and deletes the old id 41 through the named op: 204, the old relation is gone", async () => {
    answerUpload()
    answerDelete()
    const { save } = input({ saved: 41, values: { signature: "new:1" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual(["POST upload", "DELETE 41 204"])
    expect(relations).toEqual([57])
  })

  it.each([
    ["a 502 UPSTREAM_ERROR", UPSTREAM_ERROR],
    ["a 404 NO_FILE", NO_FILE],
  ])("a failed old delete (%s) still saves (best effort); the old relation stays behind the new one", async (_name, failure) => {
    answerUpload()
    answerDelete({ failure })
    const { save, rebase } = input({ saved: 41, values: { signature: "new:1" } })
    expect(await savePersonal(save)).toEqual({ result: { ok: true }, failedParts: [] })
    expect(writes).toEqual(["POST upload", `DELETE 41 ${failure().status}`])
    expect(relations).toEqual([41, 57])
    expect(rebase).not.toHaveBeenCalled()
  })

  it("a failed re-read deletes nothing and still saves", async () => {
    answerUpload()
    answerDelete()
    // Read 1 is the D-A safeguard's before the upload; read 2 is the step's re-read.
    answerMyself((read) => (read === 2 ? UPSTREAM_ERROR() : undefined))
    const { save } = input({ saved: 41, values: { signature: "new:1" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual(["POST upload"])
  })

  it("myself still showing the old id after the upload fails the step (the read view would keep the old Signature); nothing is deleted", async () => {
    answerUpload(undefined, null)
    answerDelete()
    const { save, rebase } = input({ saved: 41, values: { signature: "new:1" } })
    const { result, failedParts } = await savePersonal(save)
    expect(result).toMatchObject({ ok: false, error: { code: "GENERIC", mapped: { kind: "generic" } } })
    expect(failedParts).toEqual(["signature"])
    expect(writes).toEqual(["POST upload"])
    expect(relations).toEqual([41])
    expect(rebase).toHaveBeenCalledWith(toPersonalValues(myselfWith(41)))
  })

  it("a session failure on the old delete (401 TOKEN_EXPIRED, refresh refused) fails the step", async () => {
    answerUpload()
    answerDelete({ failure: TOKEN_EXPIRED })
    refreshEndsSession()
    const { save } = input({ saved: 41, values: { signature: "new:1" } })
    const { result, failedParts } = await savePersonal(save)
    expect(result).toMatchObject({ ok: false, error: { code: "SESSION_EXPIRED" } })
    expect(failedParts).toEqual(["signature"])
  })

  it("a session failure on the re-read fails the step", async () => {
    answerUpload()
    answerMyself((read) => (read === 2 ? TOKEN_EXPIRED() : undefined))
    refreshEndsSession()
    const { save } = input({ saved: 41, values: { signature: "new:1" } })
    expect((await savePersonal(save)).result).toMatchObject({ ok: false, error: { code: "SESSION_EXPIRED" } })
  })
})

describe("savePersonal: remove", () => {
  it("deletes the saved id, then a leftover older relation; myself shows none", async () => {
    relations = [30, 41]
    answerDelete()
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual(["DELETE 41 204", "DELETE 30 204"])
    expect(relations).toEqual([])
  })

  it("a first delete answering 404 NO_FILE (already gone, e.g. another tab) counts as deleted: the re-read decides", async () => {
    relations = []
    answerDelete()
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual(["DELETE 41 404"])

    relations = [30]
    writes = []
    expect((await savePersonal(input({ saved: 41, values: { signature: "cleared" } }).save)).result).toEqual({ ok: true })
    expect(writes).toEqual(["DELETE 41 404", "DELETE 30 204"])
    expect(relations).toEqual([])
  })

  it(`stops after ${SIGNATURE_REMOVE_ROUNDS} leftover rounds and fails the step`, async () => {
    // Every delete reveals another, older relation.
    answerDelete({ after: (id) => relations.unshift(id - 1) })
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    const { result, failedParts } = await savePersonal(save)
    expect(result).toMatchObject({ ok: false, error: { code: "UNEXPECTED" } })
    expect(failedParts).toEqual(["signature"])
    expect(writes).toEqual(["DELETE 41 204", "DELETE 40 204", "DELETE 39 204", "DELETE 38 204", "DELETE 37 204", "DELETE 36 204"])
  })

  it("a failed delete (502 UPSTREAM_ERROR) fails the step", async () => {
    answerDelete({ failure: UPSTREAM_ERROR })
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    const { result, failedParts } = await savePersonal(save)
    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } })
    expect(failedParts).toEqual(["signature"])
    expect(relations).toEqual([41])
  })

  it("a failed re-read after the delete fails the step", async () => {
    answerDelete()
    answerMyself((read) => (read === 2 ? UPSTREAM_ERROR() : undefined))
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    expect((await savePersonal(save)).result).toMatchObject({ ok: false })
    expect(writes).toEqual(["DELETE 41 204"])
  })

  it("no saved id in myself skips the step", () => {
    const { save } = input({ saved: 41, values: { signature: "cleared" } })
    const steps = personalSaveSteps({ ...save, myself: myselfWith(null) })
    expect(steps.map((step) => [step.part, step.skip])).toEqual([
      ["user-edit", true],
      ["signature", true],
    ])
  })
})

describe("savePersonal: failures and rebase", () => {
  it("PUT ok, upload 500: not ok, only the Signature failed; myself refetched and the baseline rebased", async () => {
    answerEdit()
    answerUpload(() => HttpResponse.json({ message: "boom" }, { status: 500 }))
    relations = []
    const { save, rebase, refreshMyself } = input({ saved: null, values: { firstName: "Anna", signature: "new:1" } })
    const { result, failedParts } = await savePersonal(save)
    expect(result).toMatchObject({ ok: false, error: { code: "GENERIC", mapped: { kind: "generic" } } })
    expect(failedParts).toEqual(["signature"])
    expect(refreshMyself).toHaveBeenCalledTimes(1)
    expect(rebase).toHaveBeenCalledWith(toPersonalValues(myselfWith(null)))
  })

  it("a retry after the rebase sends only the Signature step", async () => {
    const { save } = input({ saved: null, values: { firstName: "Anna", signature: "new:1" } })
    const rebased = { ...save.baseline, firstName: "Anna" }
    const steps = personalSaveSteps({ ...save, baseline: rebased })
    expect(steps.map((step) => [step.part, Boolean(step.skip)])).toEqual([
      ["user-edit", true],
      ["signature", false],
    ])
  })

  it("a failed PUT stops: both parts unsaved, nothing uploaded", async () => {
    answerEdit(() => HttpResponse.json({ message: "Invalid value", code: "INVALID_ENUM_VALUE" }, { status: 400 }))
    answerUpload()
    const { save } = input({ saved: null, values: { firstName: "Anna", signature: "new:1" } })
    const { failedParts } = await savePersonal(save)
    expect(failedParts).toEqual(["user-edit", "signature"])
    expect(writes).toEqual(['PUT {"firstName":"Anna"}'])
  })

  it("a re-encode failure or an empty pad fails the step without an upload", async () => {
    relations = []
    answerUpload()
    vi.mocked(reencodeImage).mockResolvedValueOnce({ ok: false, reason: "TOO_LARGE" })
    expect((await savePersonal(input({ saved: null, values: { signature: "new:1" } }).save)).result).toMatchObject({ ok: false, error: { code: "UNEXPECTED" } })
    expect((await savePersonal(input({ saved: null, values: { signature: "new:1" }, drawing: null }).save)).result).toMatchObject({ ok: false })
    expect((await savePersonal(input({ saved: null, values: { signature: "new:9" } }).save)).result).toMatchObject({ ok: false })
    expect(writes).toEqual([])
  })

  it("a refetch without data leaves the baseline; a failing revalidation after success still saves", async () => {
    answerUpload(() => HttpResponse.json({ message: "boom" }, { status: 500 }))
    const failing = input({ saved: null, values: { signature: "new:1" } })
    failing.refreshMyself.mockResolvedValueOnce(undefined)
    expect((await savePersonal(failing.save)).result).toMatchObject({ ok: false })
    expect(failing.rebase).not.toHaveBeenCalled()

    answerUpload()
    const ok = input({ saved: null, values: { signature: "new:1" } })
    ok.refreshMyself.mockRejectedValueOnce(new Error("offline"))
    expect((await savePersonal(ok.save)).result).toEqual({ ok: true })
  })

  it("nothing to send runs nothing and resolves ok", async () => {
    const { save } = input({ saved: null, values: { signature: "cleared" } })
    expect((await savePersonal(save)).result).toEqual({ ok: true })
    expect(writes).toEqual([])
  })
})

describe("the client never sends isPublic, current or hardDelete", () => {
  it("in any request URL of a new, replace or remove save", async () => {
    answerEdit()
    answerUpload()
    answerDelete()
    await savePersonal(input({ saved: 41, values: { firstName: "Anna", signature: "new:1" } }).save)
    await savePersonal(input({ saved: 57, values: { signature: "cleared" } }).save)
    expect(writes).toEqual(['PUT {"firstName":"Anna"}', "POST upload", "DELETE 41 204", "DELETE 57 204"])
    expect(relations).toEqual([])
    expect(urls.length).toBeGreaterThan(4)
    for (const url of urls) expect(url).not.toMatch(FORBIDDEN_PARAMS)
  })
})
