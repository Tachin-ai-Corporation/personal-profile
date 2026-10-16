/**
 * The app's only image re-encode (Story 1.10, AD-13, RC11; reused by 2.4 and
 * 5.3). Browser-only: it draws through a canvas, so it lives here and not in
 * the isomorphic `lib/shared`. Re-encoding drops every metadata segment of
 * the original (EXIF, GPS, trailing bytes): an in-app upload never sends the
 * original bytes (D-C, 2026-10-15).
 *
 * No network, no storage, and it never throws: every failure is a `reason`.
 */

export type ReencodeFormat = "jpeg" | "png"

export interface ReencodeDims {
  readonly width: number
  readonly height: number
}

export interface ReencodeOptions {
  readonly format: ReencodeFormat
  /** The largest acceptable blob, in bytes. */
  readonly maxBytes: number
  /** The box the image must fit in, in either orientation. The image is never upscaled. */
  readonly maxDims: ReencodeDims
}

export type ReencodeFailure = "UNDECODABLE" | "TOO_LARGE"

export type ReencodeResult =
  | { readonly ok: true; readonly blob: Blob; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: ReencodeFailure }

/** JPEG quality steps tried at each size, before the size shrinks. */
export const REENCODE_JPEG_QUALITIES: readonly number[] = [0.92, 0.85, 0.75, 0.6]
/** Each size step multiplies both sides by this. */
export const REENCODE_SCALE_STEP = 0.8
/** Shrinking stops before the shorter side drops below this (`TOO_LARGE`). */
export const REENCODE_MIN_SIDE = 64

const MIME: Record<ReencodeFormat, string> = { jpeg: "image/jpeg", png: "image/png" }

/** A decoded image: its size and a way to draw it. */
interface Decoded {
  readonly source: CanvasImageSource
  readonly width: number
  readonly height: number
  readonly close: () => void
}

/** Decodes with `createImageBitmap` (EXIF orientation applied); `null` when it can't. */
async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== "function") return null
  try {
    const bitmap = await createImageBitmap(file)
    if (bitmap.width < 1 || bitmap.height < 1) {
      bitmap.close()
      return null
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    return null
  }
}

/** `true` when the browser can decode `file` as an image (used to validate a file when it is chosen). */
export async function canDecodeImage(file: Blob): Promise<boolean> {
  const decoded = await decode(file)
  decoded?.close()
  return decoded !== null
}

/**
 * The size that fits `maxDims` (turned to the image's orientation) without
 * upscaling, rounded, at least 1 px per side.
 */
export function fitWithin(width: number, height: number, maxDims: ReencodeDims): ReencodeDims {
  const long = Math.max(maxDims.width, maxDims.height)
  const short = Math.min(maxDims.width, maxDims.height)
  const [boxWidth, boxHeight] = width >= height ? [long, short] : [short, long]
  const scale = Math.min(1, boxWidth / width, boxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/** Draws `decoded` on `canvas` at `dims` (on white for JPEG, which has no transparency); `false` without a 2d context. */
function draw(canvas: HTMLCanvasElement, decoded: Decoded, dims: ReencodeDims, format: ReencodeFormat): boolean {
  canvas.width = dims.width
  canvas.height = dims.height
  const context = canvas.getContext("2d")
  if (!context) return false
  if (format === "jpeg") {
    context.fillStyle = "white"
    context.fillRect(0, 0, dims.width, dims.height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(decoded.source, 0, 0, dims.width, dims.height)
  return true
}

/** Frees a canvas's backing store at once (iOS caps the total canvas memory of a page). */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/**
 * Decodes `file` (PNG, JPEG or BMP), fits it in `maxDims` without upscaling
 * and re-encodes it through a canvas until the blob is at most `maxBytes`:
 * - `jpeg`: transparency on white; at each size the qualities 0.92, 0.85,
 *   0.75, 0.6, then both sides × 0.8;
 * - `png`: both sides × 0.8 per step.
 *
 * Resolves `{ ok: true, blob, width, height }` for the first blob that fits,
 * `UNDECODABLE` when the image can't be decoded (or the canvas can't encode),
 * `TOO_LARGE` when the next size would make the shorter side smaller than
 * 64 px.
 */
export async function reencodeImage(file: Blob, { format, maxBytes, maxDims }: ReencodeOptions): Promise<ReencodeResult> {
  const decoded = await decode(file)
  if (!decoded) return { ok: false, reason: "UNDECODABLE" }
  try {
    const mime = MIME[format]
    const qualities: readonly (number | undefined)[] = format === "jpeg" ? REENCODE_JPEG_QUALITIES : [undefined]
    let dims = fitWithin(decoded.width, decoded.height, maxDims)
    for (;;) {
      const canvas = document.createElement("canvas")
      try {
        if (!draw(canvas, decoded, dims, format)) return { ok: false, reason: "UNDECODABLE" }
        for (const quality of qualities) {
          const blob = await toBlob(canvas, mime, quality)
          // No blob, or the browser fell back to another type: it can't encode this.
          if (!blob || blob.type !== mime) return { ok: false, reason: "UNDECODABLE" }
          if (blob.size <= maxBytes) return { ok: true, blob, width: dims.width, height: dims.height }
        }
      } finally {
        release(canvas)
      }
      const next = { width: Math.round(dims.width * REENCODE_SCALE_STEP), height: Math.round(dims.height * REENCODE_SCALE_STEP) }
      if (Math.min(next.width, next.height) < REENCODE_MIN_SIDE) return { ok: false, reason: "TOO_LARGE" }
      dims = next
    }
  } catch {
    return { ok: false, reason: "UNDECODABLE" }
  } finally {
    decoded.close()
  }
}
