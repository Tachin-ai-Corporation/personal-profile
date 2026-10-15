import "server-only"

import type { BffErrorCode } from "@/lib/shared/bff-contract"
import { IMAGE_CONTENT_TYPES, SNIFF_BYTES, sniffImage, type ImageKind } from "@/lib/server/http/image-sniff"
import { readCapped } from "@/lib/server/http/read-capped"
import type { UploadImageType, UploadSpec } from "./types"

/** Multipart framing allowed on top of an upload entry's file cap. */
export const UPLOAD_OVERHEAD_BYTES = 16 * 1024

const MULTIPART = /^multipart\/form-data\s*;(.*)$/i
const BOUNDARY = /(^|;)\s*boundary=("?)[^";\s][^";]{0,69}\2\s*(;|$)/i
const FILE_NAME_MAX = 100
const EXTENSIONS: Readonly<Record<UploadImageType, string>> = { png: "png", jpeg: "jpg", bmp: "bmp" }

export type UploadRead =
  | { readonly ok: true; readonly form: FormData }
  | { readonly ok: false; readonly status: number; readonly errorCode: BffErrorCode }

/** Not `multipart/form-data` at all, or a file whose bytes aren't an accepted image. */
const unsupported: UploadRead = { ok: false, status: 415, errorCode: "UNSUPPORTED_MEDIA" }
/** `multipart/form-data`, but malformed for this entry (spec F7-2 review): no boundary, unparsable, not exactly one file part with the entry's name. */
const badBody: UploadRead = { ok: false, status: 400, errorCode: "BAD_BODY" }
const tooLarge: UploadRead = { ok: false, status: 413, errorCode: "TOO_LARGE" }

const FORM_DATA = /^multipart\/form-data\s*(;|$)/i

function hasBoundary(contentType: string): boolean {
  const match = MULTIPART.exec(contentType)
  return match !== null && BOUNDARY.test(match[1])
}

function isAccepted(kind: ImageKind | null, types: readonly UploadImageType[]): kind is UploadImageType {
  return kind !== null && (types as readonly string[]).includes(kind)
}

/**
 * The upstream file name: the client's base name reduced to `[A-Za-z0-9._-]`
 * (at most 100 characters, leading dots dropped), with the extension of the
 * sniffed type; `file.<ext>` when nothing is left.
 */
export function sanitizeFileName(name: string, kind: UploadImageType): string {
  const extension = EXTENSIONS[kind]
  const base = name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1)
  const stem = base.replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "")
  const trimmed = stem.slice(0, FILE_NAME_MAX - extension.length - 1)
  return `${trimmed || "file"}.${extension}`
}

/**
 * Reads and validates an upload entry's body (AD-13, Story 1.10). Checks, in
 * order: `multipart/form-data` (else 415) with a boundary (else 400
 * `BAD_BODY`), the request cap `maxBytes + 16 KiB` by `Content-Length` and
 * while streaming (413), a parsable body with exactly one entry, a file named
 * `spec.part` (400 `BAD_BODY`: a malformed request, spec F7-2 review), the
 * file cap `maxBytes` (413) and the file's leading bytes against `spec.types`
 * (415: the only "this file can't be used" answer besides 413, which the
 * client maps to `isUploadRejected`). Returns a rebuilt `FormData` with that one part only:
 * a Blob typed from the sniffed bytes and a sanitized file name. Nothing the
 * client sent besides the file's bytes reaches upstream.
 */
export async function readUpload(request: Request, spec: UploadSpec, maxBytes: number): Promise<UploadRead> {
  const contentType = request.headers.get("Content-Type")
  if (contentType === null || !FORM_DATA.test(contentType)) return unsupported
  if (!hasBoundary(contentType)) return badBody

  const read = await readCapped(request, maxBytes + UPLOAD_OVERHEAD_BYTES)
  if (!read.ok) return read

  let form: FormData
  try {
    form = await new Response(read.bytes, { headers: { "Content-Type": contentType } }).formData()
  } catch {
    return badBody
  }
  const entries = [...form.entries()]
  if (entries.length !== 1) return badBody
  const [name, file] = entries[0]
  if (name !== spec.part || typeof file === "string") return badBody
  if (file.size > maxBytes) return tooLarge

  const kind = sniffImage(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()))
  if (!isAccepted(kind, spec.types)) return unsupported

  const upstream = new FormData()
  upstream.append(spec.part, new Blob([await file.arrayBuffer()], { type: IMAGE_CONTENT_TYPES[kind] }), sanitizeFileName(file.name, kind))
  return { ok: true, form: upstream }
}
