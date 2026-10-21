import { reencodeImage, type ReencodeOptions } from "@/components/ui/image-reencode"
import { COMMON_MESSAGES, formatMessage, INSURANCE_MESSAGES } from "@/lib/shared/messages"

/**
 * The insurance card image rules (Story 5.3, FR29, RC11): what a slot's
 * picker offers, what a chosen file must be before anything is uploaded, and
 * what it is re-encoded to. Written here, on top of `components/ui/
 * image-reencode.ts`, because a feature never imports another feature
 * (`features/header/picture-file.ts`).
 */

/** The hidden file input's `accept`. */
export const INSURANCE_CARD_ACCEPT = "image/png,image/jpeg"

/** A chosen file may be up to 10 MB (10 × 1024 × 1024 bytes). */
export const INSURANCE_CARD_MAX_BYTES = 10 * 1024 * 1024

/** At most 6000 × 4000 pixels, in either orientation. */
export const INSURANCE_CARD_MAX_PIXELS = { long: 6000, short: 4000 } as const

/** Every card is re-encoded to a JPEG of at most 4 MB (the proxy's cap), within 6000 px (RC11). */
export const INSURANCE_CARD_REENCODE: ReencodeOptions = {
  format: "jpeg",
  maxBytes: 4 * 1024 * 1024,
  maxDims: { width: 6000, height: 6000 },
}

/** How far into a JPEG its frame header (SOF) is looked for (APP segments such as EXIF come first). */
export const INSURANCE_CARD_HEADER_BYTES = 512 * 1024

export type InsuranceCardFileType = "png" | "jpeg"

const BY_MIME: Readonly<Record<string, InsuranceCardFileType>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
}

/** The leading bytes of each accepted type. */
const MAGIC: Readonly<Record<InsuranceCardFileType, readonly number[]>> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
}

/** Reads the first `count` bytes of `blob` (fewer when it is shorter); empty when it can't be read. */
async function leadingBytes(blob: Blob, count: number): Promise<Uint8Array> {
  try {
    return new Uint8Array(await blob.slice(0, count).arrayBuffer())
  } catch {
    return new Uint8Array(0)
  }
}

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean => bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte)

/**
 * The file's type when it is a PNG or a JPEG by its leading bytes and its
 * MIME type (`image/jpg` and `image/pjpeg` count as JPEG), which must name the
 * same type; with no MIME type the leading bytes decide. `null` for anything
 * else (an SVG, a GIF, a renamed text file, a PNG labelled as a JPEG). Never
 * throws.
 */
export async function insuranceCardFileType(file: Blob): Promise<InsuranceCardFileType | null> {
  const mime = file.type.toLowerCase()
  const declared = mime === "" ? null : BY_MIME[mime]
  if (declared === undefined) return null
  const bytes = await leadingBytes(file, MAGIC.png.length)
  const sniffed = startsWith(bytes, MAGIC.png) ? "png" : startsWith(bytes, MAGIC.jpeg) ? "jpeg" : null
  return sniffed !== null && (declared === null || declared === sniffed) ? sniffed : null
}

/** A big-endian unsigned integer of `length` bytes at `offset`. */
function readUint(bytes: Uint8Array, offset: number, length: 2 | 4): number {
  let value = 0
  for (let index = 0; index < length; index += 1) value = value * 256 + (bytes[offset + index] ?? 0)
  return value
}

/** A PNG's size from its IHDR chunk (right after the signature). */
function pngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | null {
  const ihdr = [0x49, 0x48, 0x44, 0x52]
  if (bytes.length < 24 || !ihdr.every((byte, index) => bytes[12 + index] === byte)) return null
  return { width: readUint(bytes, 16, 4), height: readUint(bytes, 20, 4) }
}

/** The JPEG frame headers whose size is read (baseline, extended sequential, progressive). */
const SOF_MARKERS: ReadonlySet<number> = new Set([0xc0, 0xc1, 0xc2])
/** Markers without a length (TEM, RST0–7). */
const STANDALONE = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)

/** A JPEG's size from its first SOF0/1/2 segment, walking the segments after SOI (APP/EXIF first). */
function jpegSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | null {
  let offset = 2
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    let marker = bytes[offset + 1]
    // Fill bytes: 0xFF repeated before the marker.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1
      marker = bytes[offset + 1]
    }
    if (STANDALONE(marker)) {
      offset += 2
      continue
    }
    if (offset + 3 >= bytes.length) return null
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 > bytes.length) return null
      return { width: readUint(bytes, offset + 7, 2), height: readUint(bytes, offset + 5, 2) }
    }
    // Start of scan or end of image before a frame header, or another SOF type: not readable here.
    if (marker === 0xda || marker === 0xd9 || (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) return null
    const length = readUint(bytes, offset + 2, 2)
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

/**
 * The image's pixel size read from its header bytes (PNG IHDR, JPEG
 * SOF0/1/2), without decoding it, so a small file that declares a huge image
 * is refused before any decode. `null` when the header can't be read.
 */
export async function insuranceCardPixelSize(file: Blob, type: InsuranceCardFileType): Promise<{ readonly width: number; readonly height: number } | null> {
  const bytes = await leadingBytes(file, type === "png" ? 24 : INSURANCE_CARD_HEADER_BYTES)
  const size = type === "png" ? pngSize(bytes) : jpegSize(bytes)
  return size !== null && size.width > 0 && size.height > 0 ? size : null
}

/** A size in MB, rounded up to one decimal (a file over a limit never reads as the limit). */
const megabytes = (bytes: number): string => (Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)

/** "{name} · 2.4 MB", or "{name} · 300 KB" while the rounded-up KB stay under 1024. */
export function insuranceChosenFileMeta(fileName: string, bytes: number): string {
  const kb = Math.ceil(bytes / 1024)
  return kb < 1024
    ? formatMessage(INSURANCE_MESSAGES.chosenFileKb, { fileName, size: String(kb) })
    : formatMessage(INSURANCE_MESSAGES.chosenFileMb, { fileName, size: megabytes(bytes) })
}

/** A chosen card image, ready to upload: the re-encoded JPEG, the chosen file's name and size. */
export interface InsuranceCardImage {
  readonly blob: Blob
  readonly name: string
  /** The chosen file's size in bytes (shown as "{name} · {size}"). */
  readonly size: number
}

export type InsuranceCardCheck = { readonly ok: true; readonly image: InsuranceCardImage } | { readonly ok: false; readonly message: string }

/**
 * Checks a chosen file before anything is uploaded (Story 5.3), in order:
 * - the type: PNG or JPEG by leading bytes (and the MIME type when there is one);
 * - the size: up to 10 MB;
 * - the dimensions from the header: at most 6000 × 4000 in either orientation;
 * - the re-encode to a JPEG of at most 4 MB (`reencodeImage`, RC11), the only decode.
 *
 * A rejection is the inline error, naming the file. A header that can't be
 * read, or an image the browser can't decode or bring to 4 MB, is
 * `COMMON_MESSAGES.uploadRejected`. Never throws.
 */
export async function checkInsuranceCardFile(file: File): Promise<InsuranceCardCheck> {
  const fileName = file.name
  const type = await insuranceCardFileType(file)
  if (type === null) return { ok: false, message: formatMessage(INSURANCE_MESSAGES.cardWrongType, { fileName }) }
  if (file.size > INSURANCE_CARD_MAX_BYTES) return { ok: false, message: formatMessage(INSURANCE_MESSAGES.cardTooLarge, { fileName, size: megabytes(file.size) }) }
  const unusable: InsuranceCardCheck = { ok: false, message: formatMessage(COMMON_MESSAGES.uploadRejected, { fileName }) }
  const size = await insuranceCardPixelSize(file, type)
  if (size === null) return unusable
  if (Math.max(size.width, size.height) > INSURANCE_CARD_MAX_PIXELS.long || Math.min(size.width, size.height) > INSURANCE_CARD_MAX_PIXELS.short) {
    return { ok: false, message: formatMessage(INSURANCE_MESSAGES.cardTooManyPixels, { fileName }) }
  }
  const encoded = await reencodeImage(file, INSURANCE_CARD_REENCODE)
  return encoded.ok ? { ok: true, image: { blob: encoded.blob, name: fileName, size: file.size } } : unusable
}
