export interface Part {
  readonly name: string
  readonly bytes?: Uint8Array<ArrayBuffer>
  /** A file part (default); `false` adds a plain text field. */
  readonly filename?: string | false
  readonly type?: string
}

export interface Multipart {
  readonly body: Uint8Array<ArrayBuffer>
  readonly contentType: string
}

/** Serializes parts the way a browser `FormData` upload does. */
export async function multipart(parts: readonly Part[]): Promise<Multipart> {
  const form = new FormData()
  for (const part of parts) {
    if (part.filename === false) form.append(part.name, "text value")
    else form.append(part.name, new Blob([part.bytes ?? new Uint8Array(0)], { type: part.type ?? "image/png" }), part.filename ?? "photo.png")
  }
  const request = new Request("http://localhost/", { method: "POST", body: form })
  return { body: new Uint8Array(await request.arrayBuffer()), contentType: request.headers.get("Content-Type") ?? "" }
}

/** The body as a chunked stream (no Content-Length), 64 KiB per chunk. */
export function chunkedBody(body: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.byteLength) {
        controller.close()
        return
      }
      controller.enqueue(body.slice(offset, offset + 65_536))
      offset += 65_536
    },
  })
}

export type Transfer = "header" | "chunked"

/** Request init for a multipart body sent with a Content-Length header or chunked. */
export function multipartInit(payload: Multipart, transfer: Transfer = "header", headers: Record<string, string> = {}): RequestInit {
  const base: Record<string, string> = { "Content-Type": payload.contentType, ...headers }
  if (transfer === "header") return { method: "POST", headers: { ...base, "Content-Length": String(payload.body.byteLength) }, body: payload.body }
  return { method: "POST", headers: base, body: chunkedBody(payload.body), duplex: "half" } as RequestInit
}
