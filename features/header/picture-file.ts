import { canDecodeImage, type ReencodeOptions } from "@/components/ui/image-reencode"
import { formatMessage, HEADER_MESSAGES } from "@/lib/shared/messages"

/**
 * The Profile Picture file rules (Story 1.10, FR10, UX-DR15): what the picker
 * offers, what a chosen file must be, and what Save re-encodes it to.
 */

/** The picker's `accept`, exactly as the AC states. */
export const PICTURE_ACCEPT = "image/jpeg,image/png,image/bmp,.jpg,.jpeg,.png,.bmp"

/** A chosen file may be up to 6 MB (6 × 1024 × 1024 bytes). */
export const PICTURE_MAX_BYTES = 6 * 1024 * 1024

/** Save always re-encodes to a JPEG of at most 4 MB (the proxy's cap), within 4096 px (D-C, AD-13). */
export const PICTURE_REENCODE: ReencodeOptions = {
  format: "jpeg",
  maxBytes: 4 * 1024 * 1024,
  maxDims: { width: 4096, height: 4096 },
}

export type PictureFileType = "JPG" | "PNG" | "BMP"

const BY_EXTENSION: Readonly<Record<string, PictureFileType>> = { jpg: "JPG", jpeg: "JPG", png: "PNG", bmp: "BMP" }
const BY_MIME: Readonly<Record<string, PictureFileType>> = {
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/pjpeg": "JPG",
  "image/png": "PNG",
  "image/bmp": "BMP",
  "image/x-bmp": "BMP",
  "image/x-ms-bmp": "BMP",
  "image/x-windows-bmp": "BMP",
}

/**
 * The file's type, checked by extension and MIME type: both must name the
 * same accepted type (a browser that reports no MIME type leaves it to the
 * extension, and decoding then decides). `null` for anything else.
 */
export function pictureFileType(file: Pick<File, "name" | "type">): PictureFileType | null {
  const dot = file.name.lastIndexOf(".")
  const byExtension = dot === -1 ? undefined : BY_EXTENSION[file.name.slice(dot + 1).toLowerCase()]
  if (byExtension === undefined) return null
  if (file.type === "") return byExtension
  return BY_MIME[file.type.toLowerCase()] === byExtension ? byExtension : null
}

/**
 * "2.4 MB" (rounded up to one decimal, so a file over a limit never reads as
 * the limit), or "300 KB" while the rounded-up KB stay under 1024.
 */
export function formatPictureFileSize(bytes: number): string {
  const kb = Math.ceil(bytes / 1024)
  if (kb < 1024) return formatMessage(HEADER_MESSAGES.fileSizeKb, { size: String(kb) })
  const mb = bytes / (1024 * 1024)
  return formatMessage(HEADER_MESSAGES.fileSizeMb, { size: (Math.ceil(mb * 10) / 10).toFixed(1) })
}

/** A chosen file, evaluated once when it is chosen. */
export type PictureChoice =
  | { readonly file: File; readonly status: "valid"; readonly type: PictureFileType }
  | { readonly file: File; readonly status: "tooLarge" }
  | { readonly file: File; readonly status: "wrongType" }

/**
 * Evaluates a chosen file: the type (extension and MIME), then the 6 MB
 * limit, then a real decode, so a renamed or corrupt file is caught before
 * Save.
 */
export async function evaluatePictureFile(file: File): Promise<PictureChoice> {
  const type = pictureFileType(file)
  if (type === null) return { file, status: "wrongType" }
  if (file.size > PICTURE_MAX_BYTES) return { file, status: "tooLarge" }
  return (await canDecodeImage(file)) ? { file, status: "valid", type } : { file, status: "wrongType" }
}
