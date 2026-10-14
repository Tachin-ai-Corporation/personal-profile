"use client"

import { useCallback, useState, type JSX } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { fileDownloadPath } from "@/lib/api"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"

export interface SignatureThumbProps {
  /** The signature file id (`myself.signature.id`); `null`/`undefined` shows the fallback. */
  readonly fileId: number | string | null | undefined
  /** Shown when there is no file or the image fails: "Not provided" (Story 2.1) or "No signature available" (Story 9.3). */
  readonly fallback: string
  /** Defaults to "Your signature". */
  readonly alt?: string
  readonly className?: string
}

type ThumbStatus = "loading" | "loaded" | "failed"

/**
 * `signature-thumb` (DESIGN.md, Stories 2.1, 9.3; F3-3): a 112 × 32 px
 * `object-contain` image on the background surface with a hairline border,
 * loaded straight from the proxy's `asImage` download entry (no blob, no
 * token in the browser). A skeleton shows until it loads; a failed load shows
 * the caller's fallback text instead of a broken image. Each file id gets a
 * fresh image (`key={fileId}`).
 */
export function SignatureThumb({ fileId, fallback, alt = SHELL_MESSAGES.signatureAlt, className }: SignatureThumbProps): JSX.Element {
  const src = fileId === null || fileId === undefined ? null : fileDownloadPath(fileId)
  if (src === null) return <ThumbFallback text={fallback} className={className} />
  return <ThumbImage key={String(fileId)} src={src} alt={alt} fallback={fallback} className={className} />
}

function ThumbFallback({ text, className }: { readonly text: string; readonly className?: string }) {
  return (
    <span data-slot="signature-thumb-fallback" className={cn("text-muted-foreground text-body-sm", className)}>
      {text}
    </span>
  )
}

interface ThumbImageProps {
  readonly src: string
  readonly alt: string
  readonly fallback: string
  readonly className?: string
}

function ThumbImage({ src, alt, fallback, className }: ThumbImageProps) {
  const [status, setStatus] = useState<ThumbStatus>("loading")

  // An image that finished before hydration fires no load/error event: read its state once attached.
  const attach = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return
    setStatus(img.naturalWidth > 0 ? "loaded" : "failed")
  }, [])

  if (status === "failed") return <ThumbFallback text={fallback} className={className} />

  return (
    <span
      data-slot="signature-thumb"
      data-state={status}
      aria-busy={status === "loading" ? "true" : undefined}
      className={cn("bg-background relative inline-flex h-8 w-28 shrink-0 overflow-hidden rounded-sm border", className)}
    >
      {status === "loading" && (
        <Skeleton aria-hidden="true" data-slot="signature-thumb-skeleton" className="bg-muted motion-reduce:animate-none absolute inset-0 rounded-none" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied, session-bound image: next/image would re-fetch it through the optimizer without the session */}
      <img
        ref={attach}
        src={src}
        alt={alt}
        width={112}
        height={32}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("failed")}
        className={cn("size-full object-contain", status === "loading" && "opacity-0")}
      />
    </span>
  )
}
