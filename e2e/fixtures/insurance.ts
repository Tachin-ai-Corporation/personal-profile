import type { Page, Request } from "@playwright/test"
import { json, mockProxy, mockTypeKey, PNG_1X1, type FileAnswer, type ProxyAnswer, type ProxyResponder } from "./core"

/** Insurance (Team A, Epic 5) mocks. Stories 5.1–5.5 add their search, write and card mocks here. */

/**
 * One `ResponseInsuranceDTO` as the list returns it (Story 5.1): by default
 * an active Primary Medical policy of the user (Self) with front and back card
 * images (files 900 and 901). Override any field.
 */
export function insurancePolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 55,
    memberIdNumber: "948221037",
    insuranceType: "MEDICAL",
    planEffectiveDate: "2025-01-01",
    insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7, location: null, naicCode: null },
    insuranceGroupId: "704512",
    expirationDate: "2026-12-31",
    cancellationDate: "1970-01-01",
    subscriber: null,
    owner: null,
    insurancePrecedence: "PRIMARY",
    relationshipToInsured: "SELF",
    label: "Active",
    frontSideCardFile: { id: 900, name: "front.jpg", publicURL: null },
    backSideCardFile: { id: 901, name: "back.jpg", publicURL: null },
    ...overrides,
  }
}

/**
 * The list's page around `rows`, as the backend answers `?page=0&size=100`:
 * its own `PageImpl` (`common/repository/PageImpl.java`: `data`, `lastPage`, …).
 */
export function insurancePage(rows: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    data: rows,
    pageNumber: 0,
    pageSize: 100,
    offset: 0,
    emptyPage: rows.length === 0,
    firstPage: true,
    lastPage: true,
    numberOfElements: rows.length,
    totalElements: rows.length,
    totalPages: 1,
  }
}

/**
 * `GET v2/health/patient/insurance?page=0&size=100` (Story 5.1); default an
 * empty Page (no policies). `answer` may be a function of the request (Story
 * 5.4: a list that changes once a write went).
 */
export async function mockInsurance(page: Page, answer: ProxyResponder = {}): Promise<() => Request[]> {
  return mockProxy(page, "v2/health/patient/insurance?**", (request) => {
    const { status = 200, body = insurancePage() } = typeof answer === "function" ? answer(request) : answer
    return { status, body }
  })
}

/**
 * `GET v2/health/insurance/{insuranceId}/file/{fileId}/download?fileRelKey=…`
 * (Story 5.1 thumbnails and viewer, the proxy's `asImage` entry). Both ids
 * default to any id; the answer defaults to `PNG_1X1`. Returns the requests
 * it answered, in order.
 */
export async function mockInsuranceCard(
  page: Page,
  insuranceId: number | "*" = "*",
  fileId: number | "*" = "*",
  answer: FileAnswer = {},
): Promise<() => Request[]> {
  const seen: Request[] = []
  await page.route(`**/api/1h/v2/health/insurance/${insuranceId}/file/${fileId}/download?**`, (route) => {
    seen.push(route.request())
    return route.fulfill({ status: answer.status ?? 200, contentType: answer.contentType ?? "image/png", body: answer.body ?? PNG_1X1 })
  })
  return () => [...seen]
}

/**
 * The Insurance type key with its value lists (Story 5.2): Type on the type,
 * Precedence and Relationship on the `InsuranceBelongsToPerson` relation
 * (decision 1A), each with the backend's `n/a`.
 */
export const INSURANCE_TYPE_KEY_BODY = Object.freeze({
  boKey: "Insurance",
  attributes: [
    {
      attrKey: "insuranceType",
      name: "Insurance Type",
      type: "VALUE_LIST",
      attributeValues: ["n/a", "Dental", "Medical", "Drug", "Vision", "Hospice"].map((name, id) => ({ id: id + 1, name })),
    },
  ],
  relationships: [
    {
      relKey: "InsuranceBelongsToPerson",
      attributes: [
        {
          attrKey: "insurancePrecedence",
          type: "VALUE_LIST",
          attributeValues: ["n/a", "Primary", "Secondary", "Supplemental", "Other"].map((name, id) => ({ id: id + 10, name })),
        },
        {
          attrKey: "relationshipToInsured",
          name: "Relationship to insured",
          type: "VALUE_LIST",
          attributeValues: ["n/a", "Self", "Spouse", "Child", "Dependent", "Parent"].map((name, id) => ({ id: id + 20, name })),
        },
      ],
    },
  ],
})

/** `GET v2/type/key/Insurance` with the editor's value lists (Story 5.2); pass `{ status: 500 }` for the options error. */
export async function mockInsuranceTypeKey(page: Page, answer: ProxyAnswer = {}): Promise<() => Request[]> {
  return mockTypeKey(page, "Insurance", { status: answer.status ?? 200, body: answer.body ?? INSURANCE_TYPE_KEY_BODY })
}

/** Insurers the search knows by default (Story 5.2). */
export const INSURERS = Object.freeze([
  { id: 7, name: "Blue Shield" },
  { id: 8, name: "Blue Cross" },
  { id: 9, name: "Delta Dental" },
  { id: 11, name: "UnitedHealthcare" },
])

/**
 * `GET v2/health/insurance/organizations?name=&page=&size=20` (Story 5.2
 * insurer search): the backend `PageImpl` of the insurers whose name contains
 * `name` (case-insensitive), one page. Returns the requests it answered.
 */
export async function mockInsurers(page: Page, insurers: readonly { readonly id: number; readonly name: string }[] = INSURERS): Promise<() => Request[]> {
  return mockProxy(page, "v2/health/insurance/organizations?**", (request) => {
    const name = (new URL(request.url()).searchParams.get("name") ?? "").toLowerCase()
    const data = insurers.filter((insurer) => insurer.name.toLowerCase().includes(name))
    return { body: { data, lastPage: true, pageNumber: 0, pageSize: 20, totalElements: data.length } }
  })
}

export type InsuranceSaveBody = Record<string, unknown>

/** Records each body of `method` on `glob` and answers it (default 200 with the body and id 60). */
async function recordInsuranceWrites(page: Page, method: "POST" | "PUT", glob: string, answer: ProxyResponder): Promise<() => { readonly url: string; readonly body: InsuranceSaveBody }[]> {
  const seen: { url: string; body: InsuranceSaveBody }[] = []
  await page.route(`**/api/1h/${glob}`, (route) => {
    const request = route.request()
    if (request.method() !== method) return route.fallback()
    const body = (request.postDataJSON() ?? {}) as InsuranceSaveBody
    seen.push({ url: new URL(request.url()).pathname, body })
    const { status = 200, body: reply = { id: 60, ...body } } = typeof answer === "function" ? answer(request) : answer
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(reply) })
  })
  return () => [...seen]
}

/** `POST v2/health/patient/insurance` (Story 5.2 Add); returns the bodies sent. */
export async function mockInsuranceCreate(page: Page, answer: ProxyResponder = {}): Promise<() => InsuranceSaveBody[]> {
  const seen = await recordInsuranceWrites(page, "POST", "v2/health/patient/insurance", answer)
  return () => seen().map((write) => write.body)
}

/** `PUT v2/health/patient/insurance/{id}` (Story 5.2 Edit); returns each `{ url, body }` sent. */
export async function mockInsuranceUpdate(page: Page, answer: ProxyResponder = {}): Promise<() => { readonly url: string; readonly body: InsuranceSaveBody }[]> {
  return recordInsuranceWrites(page, "PUT", "v2/health/patient/insurance/*", answer)
}

/** One card image upload the page sent (Story 5.3). */
export interface InsuranceCardUpload {
  /** The policy id in the path. */
  readonly policyId: string
  readonly side: "front" | "back"
  /** The first part's field name (always `file`). */
  readonly part: string
  /** The first part's file name (`<sanitized base>.jpg`). */
  readonly fileName: string
  readonly contentType: string
  /** The first part's leading bytes are a JPEG's (`FF D8 FF`): every card is re-encoded. */
  readonly jpeg: boolean
  /** How many parts the body had (always 1). */
  readonly parts: number
  /** The request's query string (always empty: the proxy forces `isPublic=false`). */
  readonly search: string
}

const CARD_SIDES: Readonly<Record<string, "front" | "back">> = { InsuranceHasFrontSideCardFile: "front", InsuranceHasBackSideCardFile: "back" }

/** The parts of a `multipart/form-data` body (name, file name, type, bytes). */
function insuranceUploadParts(body: Buffer, contentType: string): { part: string; fileName: string; contentType: string; bytes: Buffer }[] {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)
  if (!boundary) return []
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`)
  const parts: { part: string; fileName: string; contentType: string; bytes: Buffer }[] = []
  let start = body.indexOf(delimiter)
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length)
    if (next === -1) break
    const chunk = body.subarray(start + delimiter.length + 2, next - 2)
    const headerEnd = chunk.indexOf("\r\n\r\n")
    if (headerEnd === -1) throw new Error("insurance card upload: a multipart part has no header terminator (CRLF CRLF)")
    const headers = chunk.subarray(0, headerEnd).toString("utf8")
    parts.push({
      part: /name="([^"]*)"/.exec(headers)?.[1] ?? "",
      fileName: /filename="([^"]*)"/.exec(headers)?.[1] ?? "",
      contentType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? "",
      bytes: chunk.subarray(headerEnd + 4),
    })
    start = next
  }
  return parts
}

/**
 * The card uploads (`POST v2/health/type/Insurance/{id}/relation/InsuranceHas{Front|Back}SideCardFile/file/upload`,
 * Story 5.3): answers `answer` (default 200 `{ id: 990 }`, or a function of
 * the upload, attempt number from 1, that may say `"abort"`) and records each
 * upload, in order.
 */
export async function mockInsuranceCardUpload(
  page: Page,
  answer: ProxyAnswer | ((upload: InsuranceCardUpload, attempt: number) => ProxyAnswer | "abort") = {},
): Promise<() => InsuranceCardUpload[]> {
  const uploads: InsuranceCardUpload[] = []
  await page.route("**/api/1h/v2/health/type/Insurance/*/relation/*/file/upload**", (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const [, policyId = "", relation = ""] = /\/Insurance\/([^/]+)\/relation\/([^/]+)\//.exec(url.pathname) ?? []
    const parts = insuranceUploadParts(request.postDataBuffer() ?? Buffer.alloc(0), request.headers()["content-type"] ?? "")
    const first = parts[0] ?? { part: "", fileName: "", contentType: "", bytes: Buffer.alloc(0) }
    const upload: InsuranceCardUpload = {
      policyId,
      side: CARD_SIDES[relation] ?? "front",
      part: first.part,
      fileName: first.fileName,
      contentType: first.contentType,
      jpeg: first.bytes[0] === 0xff && first.bytes[1] === 0xd8 && first.bytes[2] === 0xff,
      parts: parts.length,
      search: url.search,
    }
    uploads.push(upload)
    const result = typeof answer === "function" ? answer(upload, uploads.length) : answer
    if (result === "abort") return route.abort("connectionfailed")
    return json(route, result.status ?? 200, result.body ?? { id: 990 })
  })
  return () => [...uploads]
}

/**
 * A replaced card's old file delete (`DELETE /api/pp/file/{fileId}`, the
 * named op; Story 5.3): answers `status` (default 204; else `NO_FILE`).
 * Returns the deleted ids, in order.
 */
export async function mockInsuranceFileDelete(page: Page, status = 204): Promise<() => string[]> {
  const deleted: string[] = []
  await page.route("**/api/pp/file/*", (route) => {
    const request = route.request()
    if (request.method() !== "DELETE") return route.fallback()
    deleted.push(new URL(request.url()).pathname.split("/").pop() ?? "")
    return status === 204 ? route.fulfill({ status }) : json(route, status, { errorCode: "NO_FILE", source: "proxy" })
  })
  return () => [...deleted]
}

/** Story 5.4: the write log; `stop()` detaches it (it also detaches when the page closes). */
export type InsuranceWriteLog = (() => string[]) & { readonly stop: () => void }

/** The JSON body of a request, or `{}` when it has none or it isn't JSON. */
function insuranceJsonBody(request: Request): Record<string, unknown> {
  try {
    const body: unknown = request.postDataJSON()
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Story 5.4: every insurance write the page sends, in order, as
 * `PUT 55 SECONDARY` (the id and the body's precedence), `POST`,
 * `upload 60 front`, or `DELETE file 900` (the file-delete named op). Only
 * records; the answers come from the write mocks.
 */
export function insuranceWriteLog(page: Page): InsuranceWriteLog {
  const log: string[] = []
  const listener = (request: Request): void => {
    const path = new URL(request.url()).pathname
    const method = request.method()
    const deleted = /^\/api\/pp\/file\/([^/]+)$/.exec(path)
    if (method === "DELETE" && deleted) {
      log.push(`DELETE file ${deleted[1]}`)
      return
    }
    if (!path.startsWith("/api/1h/v2/health/")) return
    const upload = /\/type\/Insurance\/(\d+)\/relation\/InsuranceHas(Front|Back)SideCardFile\/file\/upload$/.exec(path)
    if (method === "POST" && upload) log.push(`upload ${upload[1]} ${upload[2].toLowerCase()}`)
    else if (method === "POST" && path === "/api/1h/v2/health/patient/insurance") log.push("POST")
    else if (method === "PUT") log.push(`PUT ${path.split("/").pop() ?? ""} ${String(insuranceJsonBody(request).insurancePrecedence)}`)
  }
  const stop = (): void => {
    page.off("request", listener)
  }
  page.on("request", listener)
  page.once("close", stop)
  return Object.assign(() => [...log], { stop })
}

/** Story 5.5: what `mockInsuranceDelete` saw. */
export interface InsuranceDeleteLog {
  /** Every DELETE request's policy id, in order, whatever its answer. */
  readonly requests: () => string[]
  /** The policy ids answered with a 2xx (the deletes that went through), in order. */
  readonly deleted: () => string[]
}

/**
 * Story 5.5: `DELETE v2/health/insurance/{id}`. Answers `answer` (default
 * the backend's 200 with an empty body; or a function of the policy id and
 * that policy's attempt number from 1, which may say `"abort"` for a network
 * failure or return a promise to hold the answer). Other methods on that
 * path fall through.
 */
export async function mockInsuranceDelete(
  page: Page,
  answer: ProxyAnswer | ((policyId: string, attempt: number) => ProxyAnswer | "abort" | Promise<ProxyAnswer | "abort">) = {},
): Promise<InsuranceDeleteLog> {
  const requests: string[] = []
  const deleted: string[] = []
  const attempts = new Map<string, number>()
  await page.route("**/api/1h/v2/health/insurance/*", async (route) => {
    const request = route.request()
    if (request.method() !== "DELETE") return route.fallback()
    const policyId = new URL(request.url()).pathname.split("/").pop() ?? ""
    requests.push(policyId)
    const attempt = (attempts.get(policyId) ?? 0) + 1
    attempts.set(policyId, attempt)
    const result = typeof answer === "function" ? await answer(policyId, attempt) : answer
    if (result === "abort") return route.abort("connectionfailed")
    const status = result.status ?? 200
    if (status >= 200 && status < 300) deleted.push(policyId)
    if (result.body === undefined) return route.fulfill({ status, body: "" })
    return json(route, status, result.body)
  })
  return { requests: () => [...requests], deleted: () => [...deleted] }
}
