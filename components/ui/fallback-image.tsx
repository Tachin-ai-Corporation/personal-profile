"use client"

import { useCallback, useRef, useState, type ImgHTMLAttributes, type JSX, type ReactNode } from "react"

export interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError" | "children"> {
  /** The image URL (a same-origin proxy or named-op path); `null`/`undefined`/`""` shows the fallback at once. */
  readonly src: string | null | undefined
  /** Shown instead of the image when there is no `src` or it fails to load (initials, an icon, "Not provided"). */
  readonly fallback: ReactNode
  /** `alt` is required: `""` for a decorative image (Story 10.2 logo), a name otherwise. */
  readonly alt: string
  /** Called once when the image failed and the fallback took its place. */
  readonly onFallback?: () => void
}

/**
 * An `<img>` that swaps itself for `fallback` when it fails (spec F7-2): the
 * one `onError` fallback for the header avatar (Story 1.9: initials) and the
 * organization logo (Story 10.2: the initials tile). No broken-image icon
 * and no error message ever show. A new `src` retries (the image is keyed by
 * it). An image that already failed before hydration (no `error` event
 * reaches React) is detected when it attaches.
 *
 * Loading state is the caller's: render the fallback or a skeleton beside it
 * while `src` is still unknown (e.g. `profile-picture-id` loading → pass
 * `src={null}`).
 */
export function FallbackImage({ src, ...props }: FallbackImageProps): JSX.Element {
  if (!src) return <>{props.fallback}</>
  return <LoadingImage key={src} src={src} {...props} />
}

function LoadingImage({ src, fallback, alt, onFallback, onLoad, ...imgProps }: FallbackImageProps & { readonly src: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const notified = useRef(false)

  const fail = useCallback(() => {
    setFailed(true)
    if (notified.current) return
    notified.current = true
    onFallback?.()
  }, [onFallback])

  // An image that finished before hydration fires no load/error event: read its state once attached.
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0) fail()
    },
    [fail],
  )

  if (failed) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element -- a proxied, session-bound image: next/image would re-fetch it through the optimizer without the session
  return <img ref={attach} src={src} alt={alt} decoding="async" onLoad={onLoad} onError={fail} {...imgProps} />
}
