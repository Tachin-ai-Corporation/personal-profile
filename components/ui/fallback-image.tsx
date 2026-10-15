"use client"

import { useCallback, useRef, useState, type ImgHTMLAttributes, type JSX, type ReactNode } from "react"

export interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "children"> {
  /** The image URL (a same-origin proxy or named-op path); `null`/`undefined`/`""` shows the fallback at once. */
  readonly src: string | null | undefined
  /**
   * Shown instead of the image when there is no `src` or it fails to load
   * (initials, an icon, "Not provided"). It must carry the same accessible
   * name as `alt` (e.g. `role="img" aria-label={alt}` on an initials tile, or
   * `aria-hidden` when `alt` is `""`), so swapping one for the other never
   * changes what a screen reader announces.
   */
  readonly fallback: ReactNode
  /** `alt` is required: `""` for a decorative image (Story 10.2 logo), a name otherwise. */
  readonly alt: string
  /**
   * Show `fallback` until the image has loaded (the image loads hidden), then
   * swap to the image; on an error the fallback simply stays. Story 10.2: the
   * initials tile shows while the org logo loads (spec F7-2 review).
   */
  readonly fallbackWhileLoading?: boolean
  /** Called once when the image failed and the fallback took its place. */
  readonly onFallback?: () => void
}

type ImageStatus = "loading" | "loaded" | "failed"

/**
 * An `<img>` that swaps itself for `fallback` when it fails (spec F7-2): the
 * one `onError` fallback for the header avatar (Story 1.9: initials) and the
 * organization logo (Story 10.2: the initials tile). No broken-image icon
 * and no error message ever show. A new `src` retries (the image is keyed by
 * it). An image that already loaded or failed before hydration (no event
 * reaches React) is detected when it attaches.
 *
 * Without `fallbackWhileLoading` the image shows while loading; the caller
 * may pass `src={null}` while the URL itself is still unknown (e.g.
 * `profile-picture-id` loading).
 */
export function FallbackImage({ src, ...props }: FallbackImageProps): JSX.Element {
  if (!src) return <>{props.fallback}</>
  return <LoadingImage key={src} src={src} {...props} />
}

function LoadingImage({
  src,
  fallback,
  alt,
  fallbackWhileLoading = false,
  onFallback,
  onLoad,
  ...imgProps
}: FallbackImageProps & { readonly src: string }): JSX.Element {
  const [status, setStatus] = useState<ImageStatus>("loading")
  const notified = useRef(false)

  const fail = useCallback(() => {
    setStatus("failed")
    if (notified.current) return
    notified.current = true
    onFallback?.()
  }, [onFallback])

  // An image that finished before hydration fires no load/error event: read its state once attached.
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img?.complete) return
      if (img.naturalWidth === 0) fail()
      else setStatus("loaded")
    },
    [fail],
  )

  if (status === "failed") return <>{fallback}</>
  const hidden = fallbackWhileLoading && status === "loading"
  return (
    <>
      {hidden && fallback}
      {/* eslint-disable-next-line @next/next/no-img-element -- a proxied, session-bound image: next/image would re-fetch it through the optimizer without the session */}
      <img
        ref={attach}
        src={src}
        alt={alt}
        decoding="async"
        onLoad={(event) => {
          setStatus("loaded")
          onLoad?.(event)
        }}
        onError={fail}
        {...imgProps}
        hidden={hidden || imgProps.hidden}
      />
    </>
  )
}
