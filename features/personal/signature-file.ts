import type { ReencodeOptions } from "@/components/ui/image-reencode"

/**
 * The Signature file rules (Story 2.4, FR14, AD-13): what "Upload image
 * instead" accepts, and what every Signature (drawn or uploaded) is
 * re-encoded to before it is sent. Written here, not reused from
 * `features/header/picture-file.ts`, because a feature never imports another
 * feature.
 */

/** The picker's `accept`: PNG or JPEG only. */
export const SIGNATURE_ACCEPT = "image/png,image/jpeg"

/** AD-13: a Signature is a PNG of at most 1 MB (the proxy's `SIGNATURE_MAX_BYTES`). */
export const SIGNATURE_MAX_BYTES = 1024 * 1024

/** The pad's CSS size: the value column's width capped at 480 px, 160 px tall. */
export const SIGNATURE_PAD_SIZE = { width: 480, height: 160 } as const

/** Every Signature: a PNG of at most 1 MB, within 2× the pad's CSS size. */
export const SIGNATURE_REENCODE: ReencodeOptions = {
  format: "png",
  maxBytes: SIGNATURE_MAX_BYTES,
  maxDims: { width: SIGNATURE_PAD_SIZE.width * 2, height: SIGNATURE_PAD_SIZE.height * 2 },
}

export type SignatureFileType = "png" | "jpeg"

const BY_MIME: Readonly<Record<string, SignatureFileType>> = { "image/png": "png", "image/jpeg": "jpeg" }

/** The leading bytes of each accepted type. */
const MAGIC: Readonly<Record<SignatureFileType, readonly number[]>> = {
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

/**
 * The file's type when it is a PNG or a JPEG by both its MIME type and its
 * leading bytes (`89 50 4E 47 0D 0A 1A 0A` / `FF D8 FF`), which must name the
 * same type; `null` for anything else (a GIF, a renamed text file, a PNG
 * labelled as a JPEG). Never throws.
 */
export async function signatureFileType(file: Blob): Promise<SignatureFileType | null> {
  const type = BY_MIME[file.type.toLowerCase()]
  if (type === undefined) return null
  const magic = MAGIC[type]
  const bytes = await leadingBytes(file, magic.length)
  return bytes.length === magic.length && magic.every((byte, index) => bytes[index] === byte) ? type : null
}
