/** Leading bytes of each format the BFF sniffs (padded so every head is ≥ 12 bytes). */
const pad = (head: number[], length = 64): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length)
  out.set(head)
  return out
}
const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>

export const IMAGES = {
  png: pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
  jpeg: pad([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  bmp: pad([0x42, 0x4d, 0x36, 0, 0, 0, 0, 0, 0, 0, 0x36, 0]),
  webp: pad([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
  wav: pad([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
  gif: text("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000"),
  svg: text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  html: text("<!doctype html><html><script>alert(1)</script></html>"),
} as const

/** `size` bytes that start like `kind` (for cap tests). */
export function imageOfSize(kind: "png" | "jpeg" | "bmp", size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size)
  out.set(IMAGES[kind].slice(0, Math.min(size, 12)))
  return out
}
