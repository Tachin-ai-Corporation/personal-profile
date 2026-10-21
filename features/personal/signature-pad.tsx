"use client"

import { Upload } from "lucide-react"
import { useEffect, useId, useImperativeHandle, useRef, useState, type ChangeEvent, type JSX, type Ref } from "react"
import SignaturePad, { type PointGroup } from "signature_pad"
import { Button } from "@/components/ui/button"
import { FieldError, type FieldControlProps } from "@/components/ui/form-field"
import { reencodeImage } from "@/components/ui/image-reencode"
import { COMMON_MESSAGES, PERSON_MESSAGES } from "@/lib/shared/messages"
import { SIGNATURE_ACCEPT, SIGNATURE_REENCODE, signatureFileType } from "./signature-file"

/** What the Section can ask of the pad: its drawing as a PNG. */
export interface SignaturePadHandle {
  /** The pad's content (strokes over any shown image) as a PNG with a transparent background; `null` when empty or it can't encode. */
  readonly exportPng: () => Promise<Blob | null>
}

/** A user change on the pad: a stroke, a Clear, or an accepted (re-encoded) upload. */
export type SignaturePadChange = { readonly kind: "drawn" } | { readonly kind: "cleared" } | { readonly kind: "uploaded"; readonly blob: Blob }

/** The image under the strokes: the saved Signature (its same-origin URL) or an accepted upload. */
export type SignaturePadImage = { readonly kind: "saved"; readonly src: string } | { readonly kind: "upload"; readonly blob: Blob }

interface ImageBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * What the pad shows, kept by the Section across a remount of the pad (the
 * edit table swaps its layout at 768 px, e.g. on a tablet's rotation), so the
 * content survives it. Never stored anywhere else.
 */
export interface SignaturePadMemory {
  /** The user drew, cleared or uploaded in this edit (the saved Signature is then not loaded again). */
  readonly touched: boolean
  readonly strokes: readonly PointGroup[]
  readonly image: SignaturePadImage | null
  /** The CSS drawing domain, retained unchanged between user edits to avoid resize drift. Older memories use the mounting pad's size. */
  readonly dimensions?: { readonly width: number; readonly height: number; readonly image?: ImageBounds }
}

/** A pad the user hasn't changed in this edit. */
export const EMPTY_SIGNATURE_PAD_MEMORY: SignaturePadMemory = Object.freeze({ touched: false, strokes: [], image: null })

export interface SignaturePadFieldProps {
  /** The row's control wiring: the canvas takes its `id` and `aria-describedby` (the help line). */
  readonly wiring: FieldControlProps
  /** The saved Signature's image (`fileDownloadPath`, same origin, so the canvas is never tainted), or `null`. */
  readonly savedSrc: string | null
  /** While saving: no drawing, no Clear, no upload (controls are never `disabled`). */
  readonly readOnly: boolean
  readonly onChange: (change: SignaturePadChange) => void
  readonly handleRef?: Ref<SignaturePadHandle>
  /** Registers the focusable control of the row (the upload button) with the Section form. */
  readonly controlRef?: (element: HTMLElement | null) => void
  /** The content to restore on mount (the Section's memory of this edit); read once. */
  readonly initialMemory?: SignaturePadMemory
  /** Called with the pad's content after every user change, so the Section can hand it back on a remount. */
  readonly onRemember?: (memory: SignaturePadMemory) => void
}

/** The image the pad shows under the strokes: the saved Signature or an upload. */
type ShownImage = HTMLImageElement

/**
 * Sizes the canvas for `devicePixelRatio` and redraws it: the shown image
 * (contained and centred), then the strokes. Both use the same drawing
 * domain, so strokes over an image remain aligned. Always derives from the
 * remembered domain, rather than scaling the previous resize's output.
 */
function paintPad(canvas: HTMLCanvasElement, pad: SignaturePad, image: ShownImage | null, memory: SignaturePadMemory): ImageBounds | undefined {
  const width = canvas.offsetWidth
  const height = canvas.offsetHeight
  if (width === 0 || height === 0) return
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const domain: NonNullable<SignaturePadMemory["dimensions"]> = memory.dimensions ?? { width, height }
  const scale = Math.min(width / domain.width, height / domain.height)
  const x = (width - domain.width * scale) / 2
  const y = (height - domain.height * scale) / 2
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext("2d")
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  pad.clear()
  let imageBounds: ImageBounds | undefined
  if (image && context && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const fit = Math.min(domain.width / image.naturalWidth, domain.height / image.naturalHeight)
    const source = domain.image ?? {
      x: (domain.width - image.naturalWidth * fit) / 2,
      y: (domain.height - image.naturalHeight * fit) / 2,
      width: image.naturalWidth * fit,
      height: image.naturalHeight * fit,
    }
    imageBounds = { x: x + source.x * scale, y: y + source.y * scale, width: source.width * scale, height: source.height * scale }
    context.drawImage(image, imageBounds.x, imageBounds.y, imageBounds.width, imageBounds.height)
  }
  const strokes = scale === 1 && x === 0 && y === 0 ? [...memory.strokes] : memory.strokes.map((group) => ({
    ...group,
    dotSize: group.dotSize * scale,
    minWidth: group.minWidth * scale,
    maxWidth: group.maxWidth * scale,
    points: group.points.map((point) => ({ ...point, x: x + point.x * scale, y: y + point.y * scale })),
  }))
  if (strokes.length > 0) pad.fromData(strokes, { clear: false })
  return imageBounds
}

/** The canvas as a PNG blob, or `null` when it can't encode. */
function canvasPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png")
    } catch {
      resolve(null)
    }
  })
}

/** The tier-1 ink colour (`--graphite`): dark ink on the paper pad in both themes. */
function inkColor(): string | undefined {
  return getComputedStyle(document.documentElement).getPropertyValue("--graphite").trim() || undefined
}

/**
 * The Signature pad (Story 2.4, FR14, UX-DR Signature pad): a direct wrapper
 * of `signature_pad` 5.1.4. A light "paper" pad in both themes (white
 * `qr-surface`, `--graphite` ink, `--slate` cue and baseline; human decision
 * 2026-10-16), the value column's width up to 480 px, 160 px tall, with a
 * 1 px `control-border`. Pointer input (mouse, touch, pen) with
 * `touch-action: none` on the canvas only; the canvas is sized for
 * `devicePixelRatio` and redrawn on every resize or rotation from its strokes
 * (`toData()`) and its shown image. The cue "Draw your signature" shows while
 * it is empty.
 *
 * "Clear" empties it; "Upload image instead" opens a visually hidden file
 * input: only a PNG or JPEG (MIME type and leading bytes) is accepted, then
 * re-encoded to a PNG ≤ 1 MB and shown in place of any drawing; otherwise an
 * error shows under the pad and it stays as it was. The saved Signature
 * (`savedSrc`) is loaded into the pad without counting as a change; a failed
 * load leaves it empty. The pad never stores, drafts or sends anything
 * itself: the Section reads the drawing through `handleRef`, and keeps the
 * content across a remount in `memory`.
 */
export function SignaturePadField({ wiring, savedSrc, readOnly, onChange, handleRef, controlRef, initialMemory, onRemember }: SignaturePadFieldProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  /** The image drawn under the strokes, and where it came from. */
  const imageRef = useRef<ShownImage | null>(null)
  const imageSourceRef = useRef<SignaturePadImage | null>(null)
  /** The currently painted image's CSS bounds, captured when a new stroke establishes a new drawing domain. */
  const imageBoundsRef = useRef<ImageBounds | undefined>(undefined)
  /** The image being loaded to show (a later upload or a Clear makes an earlier one stale). */
  const wantedRef = useRef<SignaturePadImage | null>(null)
  const memoryRef = useRef<SignaturePadMemory>(initialMemory ?? EMPTY_SIGNATURE_PAD_MEMORY)
  const contentRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const onRememberRef = useRef(onRemember)
  const readOnlyRef = useRef(readOnly)
  /** Bumped by every upload choice and every Clear: only the latest upload may land. */
  const uploadSeq = useRef(0)
  /** `false` once unmounted: a late upload never lands in the Section's memory. */
  const alive = useRef(true)
  const [hasContent, setHasContent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const keyboardId = `${id}-keyboard`
  const errorId = `${id}-error`

  useEffect(() => {
    onChangeRef.current = onChange
    onRememberRef.current = onRemember
    readOnlyRef.current = readOnly
  })

  function remember(next: SignaturePadMemory): void {
    memoryRef.current = next
    onRememberRef.current?.(next)
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  function setContent(next: boolean): void {
    contentRef.current = next
    setHasContent(next)
  }

  /**
   * Loads `source` and draws it under the strokes (kept when `keepStrokes`)
   * once it decodes, if `isCurrent()` still holds; a failed load draws
   * nothing. Returns the image, so a caller can drop a late load.
   */
  function loadImage(source: SignaturePadImage, keepStrokes: boolean, isCurrent: () => boolean, onShown?: () => void): HTMLImageElement {
    const url = source.kind === "saved" ? source.src : URL.createObjectURL(source.blob)
    const release = (): void => {
      if (source.kind === "upload") URL.revokeObjectURL(url)
    }
    const image = new Image()
    image.onload = () => {
      release()
      const canvas = canvasRef.current
      const pad = padRef.current
      if (!isCurrent() || !canvas || !pad) return
      imageRef.current = image
      imageSourceRef.current = source
      imageBoundsRef.current = paintPad(canvas, pad, image, keepStrokes ? memoryRef.current : EMPTY_SIGNATURE_PAD_MEMORY)
      onShown?.()
    }
    image.onerror = release
    image.src = url
    return image
  }

  // The pad: created once, redrawn on every resize (rotation included) and on a devicePixelRatio change.
  useEffect(() => {
    const canvas = canvasRef.current
    // No 2d context (a browser without canvas): no drawing; "Upload image instead" still works.
    if (!canvas?.getContext("2d")) return
    const pad = new SignaturePad(canvas, { penColor: inkColor() })
    padRef.current = pad
    const onEndStroke = (): void => {
      // The SDK reports CSS coordinates. A new edit establishes this viewport
      // as the domain, including any letterboxing the user just drew in.
      remember({
        touched: true,
        strokes: [...pad.toData()],
        image: imageSourceRef.current,
        dimensions: { width: canvas.offsetWidth, height: canvas.offsetHeight, ...(imageBoundsRef.current ? { image: imageBoundsRef.current } : {}) },
      })
      setContent(true)
      // A valid drawing replaces whatever upload was refused.
      setError(null)
      onChangeRef.current({ kind: "drawn" })
    }
    pad.addEventListener("endStroke", onEndStroke)
    // Legacy memories did not carry their domain; interpret them in this
    // mounting viewport, then retain that domain for subsequent resizes.
    const initial = memoryRef.current
    if (initial.strokes.length > 0 && !initial.dimensions && canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
      memoryRef.current = { ...initial, dimensions: { width: canvas.offsetWidth, height: canvas.offsetHeight } }
    }
    let size = ""
    const resize = (): void => {
      const next = `${canvas.offsetWidth}x${canvas.offsetHeight}@${window.devicePixelRatio || 1}`
      if (next === size) return
      size = next
      imageBoundsRef.current = paintPad(canvas, pad, imageRef.current, memoryRef.current)
    }
    resize()
    // A remount in the same edit: the content the user made comes back.
    const remembered = memoryRef.current
    if (remembered.touched) {
      const image = remembered.image
      if (image) {
        wantedRef.current = image
        imageSourceRef.current = image
        loadImage(image, true, () => wantedRef.current === image)
      }
      setContent(remembered.strokes.length > 0 || image !== null)
    }
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
    observer?.observe(canvas)
    window.addEventListener("resize", resize)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", resize)
      pad.removeEventListener("endStroke", onEndStroke)
      pad.off()
      padRef.current = null
    }
  }, [])

  // Read-only while saving: strokes are ignored (and the canvas lets the page scroll again).
  useEffect(() => {
    const pad = padRef.current
    if (!pad) return
    if (readOnly) pad.off()
    else pad.on()
  }, [readOnly])

  // The saved Signature, loaded into the pad (not a change) until the user changes it; a failed load leaves the pad empty.
  useEffect(() => {
    if (savedSrc === null || memoryRef.current.touched) return
    let active = true
    const image = loadImage({ kind: "saved", src: savedSrc }, false, () => active && !memoryRef.current.touched, () => setContent(true))
    return () => {
      active = false
      image.onload = null
    }
  }, [savedSrc])

  useImperativeHandle(
    handleRef,
    () => ({
      exportPng: async () => {
        const canvas = canvasRef.current
        return canvas && contentRef.current ? canvasPng(canvas) : null
      },
    }),
    [],
  )

  function clear(): void {
    if (readOnlyRef.current) return
    uploadSeq.current += 1
    remember({ touched: true, strokes: [], image: null })
    imageRef.current = null
    imageBoundsRef.current = undefined
    imageSourceRef.current = null
    wantedRef.current = null
    padRef.current?.clear()
    setContent(false)
    setError(null)
    onChangeRef.current({ kind: "cleared" })
  }

  /** Shows an accepted upload in place of any drawing (strokes drawn after it are kept). */
  function show(blob: Blob): void {
    const source: SignaturePadImage = { kind: "upload", blob }
    remember({ touched: true, strokes: [], image: source })
    wantedRef.current = source
    imageSourceRef.current = source
    imageRef.current = null
    imageBoundsRef.current = undefined
    padRef.current?.clear()
    loadImage(source, true, () => wantedRef.current === source)
  }

  async function accept(file: File): Promise<void> {
    uploadSeq.current += 1
    const seq = uploadSeq.current
    // A Clear, a newer choice or an unmount since this one started: drop its result.
    const stale = (): boolean => !alive.current || seq !== uploadSeq.current
    const type = await signatureFileType(file)
    if (stale()) return
    if (type === null) {
      setError(PERSON_MESSAGES.signatureWrongType)
      return
    }
    const encoded = await reencodeImage(file, SIGNATURE_REENCODE)
    if (stale()) return
    if (!encoded.ok) {
      setError(PERSON_MESSAGES.signatureTooLarge)
      return
    }
    // Saving started meanwhile: the pad stays as it was.
    if (readOnlyRef.current) return
    setError(null)
    show(encoded.blob)
    setContent(true)
    onChangeRef.current({ kind: "uploaded", blob: encoded.blob })
  }

  function onFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    // The same file can be chosen again after an error.
    event.target.value = ""
    // Read-only while saving: a file chosen meanwhile is ignored.
    if (file && !readOnlyRef.current) void accept(file)
  }

  function openPicker(): void {
    if (!readOnlyRef.current) fileRef.current?.click()
  }

  const describedBy = [wiring["aria-describedby"], keyboardId, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div data-slot="signature-pad-field" className="flex w-full max-w-120 flex-col gap-2">
      <div data-slot="signature-pad" className="border-control-border bg-qr-surface relative h-40 w-full overflow-hidden rounded-md border">
        {/* The baseline rule and the cue sit under the canvas; neither is part of the exported PNG. */}
        <span aria-hidden="true" data-slot="signature-baseline" className="pointer-events-none absolute inset-x-6 bottom-10 h-px bg-[var(--slate)]" />
        {hasContent ? null : (
          <span aria-hidden="true" data-slot="signature-cue" className="text-body-sm pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[var(--slate)]">
            {PERSON_MESSAGES.signatureCue}
          </span>
        )}
        <canvas
          ref={canvasRef}
          id={wiring.id}
          role="img"
          aria-label={PERSON_MESSAGES.signatureCue}
          aria-describedby={describedBy}
          data-empty={hasContent ? undefined : "true"}
          className="relative block size-full touch-none"
        />
      </div>
      <span id={keyboardId} className="sr-only">
        {PERSON_MESSAGES.signatureKeyboard}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="touch" aria-disabled={readOnly || undefined} onClick={clear}>
          {COMMON_MESSAGES.clear}
        </Button>
        <Button ref={controlRef} type="button" variant="ghost" size="touch" aria-disabled={readOnly || undefined} onClick={openPicker}>
          <Upload aria-hidden="true" />
          {PERSON_MESSAGES.signatureUpload}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={SIGNATURE_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          data-testid="signature-file-input"
          className="sr-only"
          onChange={onFile}
        />
      </div>
      <div aria-live="polite">{error ? <FieldError id={errorId}>{error}</FieldError> : null}</div>
    </div>
  )
}
