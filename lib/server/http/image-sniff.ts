import "server-only"

/** Image kinds the BFF recognises by their leading bytes (never by a declared type). */
export type ImageKind = "png" | "jpeg" | "bmp" | "webp"

export const IMAGE_CONTENT_TYPES: Readonly<Record<ImageKind, string>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  webp: "image/webp",
}

/** Bytes needed to recognise every kind (`RIFF????WEBP` is the longest). */
export const SNIFF_BYTES = 12

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const BMP = [0x42, 0x4d]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte)
}

/** The image kind of the leading bytes, or `null` (SVG, HTML, GIF, anything else). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, PNG)) return "png"
  if (startsWith(bytes, JPEG)) return "jpeg"
  if (startsWith(bytes, BMP)) return "bmp"
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp"
  return null
}

export type PeekResult =
  | { readonly kind: "ok"; readonly head: Uint8Array; readonly body: ReadableStream<Uint8Array> }
  | { readonly kind: "error" }

/**
 * Reads at least `count` leading bytes (fewer when the stream ends first) and
 * returns them with a stream that replays them followed by the rest, so a
 * download is inspected without being buffered. Never throws.
 */
export async function peekStream(stream: ReadableStream<Uint8Array>, count: number = SNIFF_BYTES): Promise<PeekResult> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let done = false
  try {
    while (total < count) {
      const next = await reader.read()
      if (next.done) {
        done = true
        break
      }
      chunks.push(next.value)
      total += next.value.byteLength
    }
  } catch {
    /* v8 ignore next -- the rejection handler only runs if cancelling the source fails */
    reader.cancel().catch(() => undefined)
    return { kind: "error" }
  }
  const head = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    head.set(chunk, offset)
    offset += chunk.byteLength
  }
  let replayed = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!replayed) {
        replayed = true
        if (head.byteLength > 0) controller.enqueue(head)
        if (done) controller.close()
        return
      }
      try {
        const next = await reader.read()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  return { kind: "ok", head, body }
}
