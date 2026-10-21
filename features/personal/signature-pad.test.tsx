import type { PointGroup } from "signature_pad"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage } from "@/components/ui/image-reencode"
import { axeViolations } from "@/test/axe"
import { SIGNATURE_REENCODE } from "./signature-file"
import { EMPTY_SIGNATURE_PAD_MEMORY, SignaturePadField, type SignaturePadChange, type SignaturePadHandle, type SignaturePadMemory } from "./signature-pad"

/**
 * Story 2.4 (NG-9022): the Signature pad in jsdom. `signature_pad` is replaced
 * by a fake that records what the wrapper asks of it (jsdom has no canvas);
 * the real drawing is `e2e/profile-personal.spec.ts`. `reencodeImage` is
 * stubbed (its algorithm is `components/ui/image-reencode.test.ts`).
 */

const { FakePad, pads, strokeGroup } = vi.hoisted(() => {
  const strokeGroup = (x = 1, y = 2): PointGroup => ({ penColor: "black", dotSize: 2, minWidth: 1, maxWidth: 3, velocityFilterWeight: 0.7, compositeOperation: "source-over", points: [{ x, y, pressure: 0.5, time: 100 }] })
  type Listener = () => void
  const pads: InstanceType<typeof FakePad>[] = []
  class FakePad {
    readonly canvas: HTMLCanvasElement
    readonly options: { penColor?: string }
    readonly listeners = new Map<string, Set<Listener>>()
    data: PointGroup[] = []
    clears = 0
    readonly fromDataCalls: PointGroup[][] = []
    on = vi.fn()
    off = vi.fn()
    constructor(canvas: HTMLCanvasElement, options: { penColor?: string } = {}) {
      this.canvas = canvas
      this.options = options
      pads.push(this)
    }
    addEventListener(type: string, listener: Listener): void {
      const set = this.listeners.get(type) ?? new Set()
      set.add(listener)
      this.listeners.set(type, set)
    }
    removeEventListener(type: string, listener: Listener): void {
      this.listeners.get(type)?.delete(listener)
    }
    clear(): void {
      this.clears += 1
      this.data = []
    }
    toData(): PointGroup[] {
      return this.data
    }
    fromData(data: PointGroup[]): void {
      this.fromDataCalls.push(data)
      this.data = this.data.concat(data)
    }
    /** One finished stroke, as signature_pad reports it. */
    stroke(group = strokeGroup()): void {
      this.data.push(group)
      for (const listener of this.listeners.get("endStroke") ?? []) listener()
    }
  }
  return { FakePad, pads, strokeGroup }
})

vi.mock("signature_pad", () => ({ default: FakePad }))
vi.mock("@/components/ui/image-reencode", () => ({ reencodeImage: vi.fn() }))

const ENCODED = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

/** The images the pad created (saved Signature loads and upload previews), in order. */
let images: FakeImage[]
let context: { setTransform: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> }
let resizeCallbacks: (() => void)[]
let size: { width: number; height: number }
let revoked: string[]

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 100
  src = ""
  constructor() {
    images.push(this)
  }
}

const wiring = { id: "personal-signature", "aria-describedby": "personal-signature-help", "aria-invalid": undefined, required: undefined, "aria-required": undefined } as const

function setup(props: { savedSrc?: string | null; readOnly?: boolean; initialMemory?: SignaturePadMemory } = {}) {
  const onChange = vi.fn<(change: SignaturePadChange) => void>()
  const onRemember = vi.fn<(memory: SignaturePadMemory) => void>()
  const controlRef = vi.fn()
  let handle: SignaturePadHandle | null = null
  const view = render(
    <>
      <p id="personal-signature-help">Draw with a mouse, finger or pen, or upload a PNG or JPEG.</p>
      <SignaturePadField
        wiring={wiring}
        savedSrc={props.savedSrc ?? null}
        readOnly={props.readOnly ?? false}
        onChange={onChange}
        handleRef={(next) => {
          handle = next
        }}
        controlRef={controlRef}
        initialMemory={props.initialMemory}
        onRemember={onRemember}
      />
    </>,
  )
  const rerender = (next: { savedSrc?: string | null; readOnly?: boolean }) =>
    view.rerender(
      <>
        <p id="personal-signature-help">Draw with a mouse, finger or pen, or upload a PNG or JPEG.</p>
        <SignaturePadField wiring={wiring} savedSrc={next.savedSrc ?? null} readOnly={next.readOnly ?? false} onChange={onChange} controlRef={controlRef} />
      </>,
    )
  return { ...view, onChange, onRemember, controlRef, handle: () => handle, rerender }
}

const canvas = (): HTMLCanvasElement => screen.getByRole("img", { name: "Draw your signature" }) as HTMLCanvasElement
const pad = (): InstanceType<typeof FakePad> => {
  const last = pads.at(-1)
  if (!last) throw new Error("no pad")
  return last
}
const fileInput = (): HTMLInputElement => screen.getByTestId("signature-file-input") as HTMLInputElement
const cue = (): HTMLElement | null => document.querySelector('[data-slot="signature-cue"]')

async function choose(file: File): Promise<void> {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files: [file] } })
  })
}

beforeEach(() => {
  pads.length = 0
  images = []
  resizeCallbacks = []
  revoked = []
  size = { width: 400, height: 160 }
  context = { setTransform: vi.fn(), drawImage: vi.fn() }
  vi.stubGlobal("Image", FakeImage)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback)
      }
      observe(): void {}
      disconnect(): void {}
    },
  )
  vi.stubGlobal("devicePixelRatio", 2)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this instanceof HTMLCanvasElement ? size.width : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this instanceof HTMLCanvasElement ? size.height : 0
  })
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:signature-1") })
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn((url: string) => revoked.push(url)) })
  document.documentElement.style.setProperty("--graphite", "rgb(32, 40, 51)")
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 960, height: 320 })
})

afterEach(() => {
  document.documentElement.style.removeProperty("--graphite")
})

describe("SignaturePadField: look and accessibility", () => {
  it("a paper pad up to 480 px wide, 160 px tall, control-border, rounded, with a baseline and the cue while empty", () => {
    setup()
    const frame = document.querySelector('[data-slot="signature-pad"]')
    expect(frame?.className).toMatch(/\bbg-qr-surface\b/)
    expect(frame?.className).toMatch(/\bborder-control-border\b/)
    expect(frame?.className).toMatch(/\brounded-md\b/)
    expect(frame?.className).toMatch(/\bh-40\b/)
    expect(document.querySelector('[data-slot="signature-pad-field"]')?.className).toMatch(/\bmax-w-120\b/)
    expect(document.querySelector('[data-slot="signature-baseline"]')?.className).toMatch(/bg-\[var\(--slate\)\]/)
    expect(cue()?.textContent).toBe("Draw your signature")
    expect(cue()?.className).toMatch(/text-\[var\(--slate\)\]/)
    expect(cue()?.getAttribute("aria-hidden")).toBe("true")
  })

  it("the ink is the theme-constant --graphite, read from the document", () => {
    setup()
    expect(pad().options.penColor).toBe("rgb(32, 40, 51)")
  })

  it("the canvas is an img named \"Draw your signature\", described by the help line and the keyboard instruction", () => {
    setup()
    expect(canvas().id).toBe("personal-signature")
    const described = (canvas().getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual([
      "Draw with a mouse, finger or pen, or upload a PNG or JPEG.",
      "Drawing needs a mouse, finger or pen. To add your signature with a keyboard, use Upload image instead.",
    ])
    const keyboard = screen.getByText(/To add your signature with a keyboard/)
    expect(keyboard.className).toMatch(/\bsr-only\b/)
  })

  it("touch-action: none on the canvas only", () => {
    setup()
    expect(canvas().className).toMatch(/\btouch-none\b/)
    expect(document.querySelector('[data-slot="signature-pad"]')?.className).not.toMatch(/touch-none/)
    expect(document.querySelector('[data-slot="signature-pad-field"]')?.className).not.toMatch(/touch-none/)
  })

  it("Clear and \"Upload image instead\" are 44 px ghost buttons; the file input is hidden and out of the tab order", () => {
    const { controlRef } = setup()
    const clear = screen.getByRole("button", { name: "Clear" })
    const upload = screen.getByRole("button", { name: "Upload image instead" })
    for (const button of [clear, upload]) {
      expect(button.className).toMatch(/\bh-11\b/)
      expect(button.className).toMatch(/hover:bg-accent/)
      expect(button.getAttribute("type")).toBe("button")
    }
    expect(upload.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(controlRef).toHaveBeenCalledWith(upload)
    expect(fileInput().className).toMatch(/\bsr-only\b/)
    expect(fileInput().tabIndex).toBe(-1)
    expect(fileInput().getAttribute("aria-hidden")).toBe("true")
    expect(fileInput().accept).toBe("image/png,image/jpeg")
  })

  it("\"Upload image instead\" opens the file picker", () => {
    setup()
    const click = vi.spyOn(fileInput(), "click").mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole("button", { name: "Upload image instead" }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it("has no axe violations, empty and with an upload error", async () => {
    setup()
    expect(await axeViolations()).toEqual([])
    await choose(new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" }))
    expect(await axeViolations()).toEqual([])
  })
})

describe("SignaturePadField: canvas size", () => {
  it("is sized for devicePixelRatio and scaled to CSS pixels", () => {
    setup()
    expect(canvas().width).toBe(800)
    expect(canvas().height).toBe(320)
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)
  })

  it("keeps the strokes on resize and rotation (redrawn from toData()); an unchanged size does nothing", () => {
    setup()
    act(() => pad().stroke())
    const strokes = [...pad().toData()]
    size = { width: 300, height: 160 }
    act(() => resizeCallbacks[0]?.())
    expect(canvas().width).toBe(600)
    expect(pad().fromDataCalls.at(-1)).toEqual([{ ...strokes[0], dotSize: 1.5, minWidth: 0.75, maxWidth: 2.25, points: [{ x: 0.75, y: 21.5, pressure: 0.5, time: 100 }] }])
    expect(pad().toData()).toEqual(pad().fromDataCalls.at(-1))
    const calls = pad().fromDataCalls.length
    act(() => resizeCallbacks[0]?.())
    expect(pad().fromDataCalls).toHaveLength(calls)
    // A window resize (rotation) is handled the same way.
    size = { width: 340, height: 160 }
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(canvas().width).toBe(680)
  })

  it("keeps edge strokes inside the exported drawing and restores their coordinates after repeated resizing", async () => {
    const view = setup()
    const original = strokeGroup(396, 156)
    act(() => pad().stroke(original))
    size = { width: 300, height: 160 }
    act(() => resizeCallbacks[0]?.())
    expect(pad().toData()[0]).toMatchObject({ dotSize: 1.5, minWidth: 0.75, maxWidth: 2.25, points: [{ x: 297, y: 137 }] })
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      const group = pad().toData()[0]
      expect(group.points[0].x + group.maxWidth).toBeLessThan(size.width)
      expect(group.points[0].y + group.maxWidth).toBeLessThan(size.height)
      callback(ENCODED)
    })
    expect(await view.handle()?.exportPng()).toBe(ENCODED)
    expect(toBlob).toHaveBeenCalledOnce()
    for (const width of [450, 280, 400, 300, 400]) {
      size = { width, height: 160 }
      act(() => resizeCallbacks[0]?.())
    }
    expect(pad().toData()).toEqual([original])
    expect(original).toEqual(strokeGroup(396, 156))
  })

  it("uses the same contained transform for a portrait image and strokes drawn over it", () => {
    setup({ savedSrc: "/api/1h/v2/file/501/download" })
    images[0].naturalWidth = 100
    images[0].naturalHeight = 400
    act(() => images[0].onload?.())
    act(() => pad().stroke(strokeGroup(200, 80)))
    size = { width: 300, height: 160 }
    act(() => resizeCallbacks[0]?.())
    expect(context.drawImage).toHaveBeenLastCalledWith(images[0], 135, 20, 30, 120)
    expect(pad().toData()[0].points[0]).toMatchObject({ x: 150, y: 80 })
  })

  it("keeps the shown image on resize", async () => {
    setup({ savedSrc: "/api/1h/v2/file/501/download" })
    act(() => images[0]?.onload?.())
    context.drawImage.mockClear()
    size = { width: 300, height: 160 }
    act(() => resizeCallbacks[0]?.())
    expect(context.drawImage).toHaveBeenCalledWith(images[0], expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number))
  })

  it("without layout (0 × 0) nothing is sized", () => {
    size = { width: 0, height: 0 }
    setup()
    expect(context.setTransform).not.toHaveBeenCalled()
  })

  it("without a 2d context there is no pad (upload still works)", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    const { onChange } = setup()
    expect(pads).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(onChange).toHaveBeenCalledWith({ kind: "cleared" })
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    expect(onChange).toHaveBeenLastCalledWith({ kind: "uploaded", blob: ENCODED })
    act(() => images[0]?.onload?.())
    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it("unmounting turns the pad off and stops listening", () => {
    const { unmount } = setup()
    const current = pad()
    unmount()
    expect(current.off).toHaveBeenCalled()
    expect(current.listeners.get("endStroke")?.size).toBe(0)
  })
})

describe("SignaturePadField: drawing and Clear", () => {
  it("a stroke is a change; the cue hides", () => {
    const { onChange } = setup()
    act(() => pad().stroke())
    expect(onChange).toHaveBeenCalledWith({ kind: "drawn" })
    expect(cue()).toBeNull()
    expect(canvas().hasAttribute("data-empty")).toBe(false)
  })

  it("Clear empties the pad, brings the cue back and is a change", () => {
    const { onChange } = setup()
    act(() => pad().stroke())
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(pad().clears).toBeGreaterThan(1)
    expect(onChange).toHaveBeenLastCalledWith({ kind: "cleared" })
    expect(cue()?.textContent).toBe("Draw your signature")
    expect(canvas().getAttribute("data-empty")).toBe("true")
  })

  it("exportPng: null while empty; the canvas as a PNG once drawn; null when the canvas can't encode", async () => {
    const view = setup()
    expect(await view.handle()?.exportPng()).toBeNull()
    act(() => pad().stroke())
    const blob = new Blob([PNG], { type: "image/png" })
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      expect(type).toBe("image/png")
      callback(blob)
    })
    expect(await view.handle()?.exportPng()).toBe(blob)
    toBlob.mockImplementation(() => {
      throw new Error("tainted")
    })
    expect(await view.handle()?.exportPng()).toBeNull()
  })

  it("read-only while saving: the pad is off, Clear and Upload do nothing", () => {
    const { onChange, rerender } = setup()
    rerender({ readOnly: true })
    expect(pad().off).toHaveBeenCalled()
    const click = vi.spyOn(fileInput(), "click").mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    fireEvent.click(screen.getByRole("button", { name: "Upload image instead" }))
    expect(onChange).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Clear" }).getAttribute("aria-disabled")).toBe("true")
    rerender({ readOnly: false })
    expect(pad().on).toHaveBeenCalled()
  })
})

describe("SignaturePadField: the saved Signature", () => {
  it("is loaded into the pad from its same-origin URL without a change", () => {
    const { onChange } = setup({ savedSrc: "/api/1h/v2/file/501/download" })
    expect(images[0]?.src).toBe("/api/1h/v2/file/501/download")
    act(() => images[0]?.onload?.())
    // 400 × 100 contained in 400 × 160: full width, centred.
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 30, 400, 100)
    expect(cue()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("a failed load leaves the pad empty and clean", () => {
    const { onChange } = setup({ savedSrc: "/api/1h/v2/file/501/download" })
    act(() => images[0]?.onerror?.())
    expect(cue()?.textContent).toBe("Draw your signature")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("a load that finishes after the user drew, or after unmount, changes nothing", () => {
    const { unmount } = setup({ savedSrc: "/api/1h/v2/file/501/download" })
    act(() => pad().stroke())
    act(() => images[0]?.onload?.())
    expect(context.drawImage).not.toHaveBeenCalled()
    unmount()
    expect(images[0]?.onload).toBeNull()
  })

  it("an image with no size is not drawn", () => {
    setup({ savedSrc: "/api/1h/v2/file/501/download" })
    const image = images[0]
    if (!image) throw new Error("no image")
    image.naturalWidth = 0
    act(() => image.onload?.())
    expect(context.drawImage).not.toHaveBeenCalled()
  })
})

describe("SignaturePadField: Upload image instead", () => {
  it.each([
    ["a GIF", new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], "a.gif", { type: "image/gif" })],
    ["a renamed text file", new File([new TextEncoder().encode("plain text here")], "notes.png", { type: "image/png" })],
  ])("%s shows \"Choose a PNG or JPEG image.\" under the pad and leaves it unchanged", async (_name, file) => {
    const { onChange } = setup()
    act(() => pad().stroke())
    onChange.mockClear()
    const clears = pad().clears
    await choose(file)
    expect(screen.getByText("Choose a PNG or JPEG image.")).toBeTruthy()
    expect(reencodeImage).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(pad().clears).toBe(clears)
    // The error describes the canvas.
    expect(canvas().getAttribute("aria-describedby")).toMatch(/-error$/)
  })

  it("a re-encode failure shows \"This image is too large. Choose a smaller one.\" and leaves the pad unchanged", async () => {
    vi.mocked(reencodeImage).mockResolvedValueOnce({ ok: false, reason: "TOO_LARGE" })
    const { onChange } = setup()
    await choose(new File([PNG], "big.png", { type: "image/png" }))
    expect(screen.getByText("This image is too large. Choose a smaller one.")).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    expect(cue()?.textContent).toBe("Draw your signature")
  })

  it("an accepted PNG or JPEG is re-encoded (PNG ≤ 1 MB, 2× the pad) and shown in place of the drawing; the error clears", async () => {
    const { onChange } = setup()
    act(() => pad().stroke())
    await choose(new File([new Uint8Array([0x47])], "a.gif", { type: "image/gif" }))
    const jpeg = new File([JPEG], "a.jpg", { type: "image/jpeg" })
    await choose(jpeg)
    expect(reencodeImage).toHaveBeenCalledWith(jpeg, SIGNATURE_REENCODE)
    expect(onChange).toHaveBeenLastCalledWith({ kind: "uploaded", blob: ENCODED })
    expect(screen.queryByText("Choose a PNG or JPEG image.")).toBeNull()
    expect(pad().toData()).toEqual([])
    expect(URL.createObjectURL).toHaveBeenCalledWith(ENCODED)
    act(() => images[0]?.onload?.())
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 30, 400, 100)
    expect(revoked).toEqual(["blob:signature-1"])
    expect(cue()).toBeNull()
  })

  it("a preview that fails to load is released; one replaced by a Clear is not drawn", async () => {
    setup()
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    act(() => images[0]?.onerror?.())
    expect(revoked).toEqual(["blob:signature-1"])
    await choose(new File([PNG], "b.png", { type: "image/png" }))
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    act(() => images[1]?.onload?.())
    expect(context.drawImage).not.toHaveBeenCalled()
  })

  it("an upload that finishes after saving started leaves the pad unchanged", async () => {
    let finish: (value: Awaited<ReturnType<typeof reencodeImage>>) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const { onChange, rerender } = setup()
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    rerender({ readOnly: true })
    await act(async () => finish({ ok: true, blob: ENCODED, width: 1, height: 1 }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("the same file can be chosen again (the input is reset); an empty choice does nothing", async () => {
    const { onChange } = setup()
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(fileInput().value).toBe("")
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [] } })
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe("SignaturePadField: memory across a remount", () => {
  it("reports its content after every user change: strokes over the shown image, a Clear, an upload", async () => {
    const { onRemember } = setup({ savedSrc: "/api/1h/v2/file/501/download" })
    act(() => images[0]?.onload?.())
    expect(onRemember).not.toHaveBeenCalled()
    act(() => pad().stroke())
    expect(onRemember).toHaveBeenLastCalledWith({ touched: true, strokes: [strokeGroup()], image: { kind: "saved", src: "/api/1h/v2/file/501/download" }, dimensions: { width: 400, height: 160, image: { x: 0, y: 30, width: 400, height: 100 } } })
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(onRemember).toHaveBeenLastCalledWith({ touched: true, strokes: [], image: null })
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    expect(onRemember).toHaveBeenLastCalledWith({ touched: true, strokes: [], image: { kind: "upload", blob: ENCODED } })
  })

  it("restores the strokes and the image it is handed, and doesn't load the saved Signature again", () => {
    const strokes = [{ points: [{ x: 3, y: 4 }] }] as unknown as SignaturePadMemory["strokes"]
    const { onChange } = setup({ savedSrc: "/api/1h/v2/file/501/download", initialMemory: { touched: true, strokes, image: { kind: "upload", blob: ENCODED } } })
    expect(pad().fromDataCalls).toEqual([strokes])
    expect(images.map((image) => image.src)).toEqual(["blob:signature-1"])
    expect(cue()).toBeNull()
    act(() => images[0]?.onload?.())
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 30, 400, 100)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("fits an edge drawing on a narrower responsive remount, including its next resize", async () => {
    const first = setup()
    act(() => pad().stroke(strokeGroup(396, 156)))
    const memory = first.onRemember.mock.calls.at(-1)?.[0]
    expect(memory).toMatchObject({ dimensions: { width: 400, height: 160 } })
    first.unmount()
    size = { width: 300, height: 160 }
    const second = setup({ initialMemory: memory })
    expect(pad().toData()[0].points[0]).toMatchObject({ x: 297, y: 137 })
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      expect(pad().toData()[0].points[0].x).toBeLessThan(size.width)
      callback(ENCODED)
    })
    expect(await second.handle()?.exportPng()).toBe(ENCODED)
    size = { width: 400, height: 160 }
    act(() => resizeCallbacks.at(-1)?.())
    expect(pad().toData()).toEqual([strokeGroup(396, 156)])
  })

  it("a remembered Clear stays empty; an untouched memory loads the saved Signature", () => {
    setup({ savedSrc: "/api/1h/v2/file/501/download", initialMemory: { touched: true, strokes: [], image: null } })
    expect(images).toEqual([])
    expect(cue()?.textContent).toBe("Draw your signature")
    images = []
    setup({ savedSrc: "/api/1h/v2/file/502/download", initialMemory: EMPTY_SIGNATURE_PAD_MEMORY })
    expect(images.map((image) => image.src)).toEqual(["/api/1h/v2/file/502/download"])
  })
})

describe("SignaturePadField: late uploads and errors", () => {
  /** Holds the next `reencodeImage` until `finish(result)`. */
  function holdReencode() {
    let finish: (value: Awaited<ReturnType<typeof reencodeImage>>) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    return (blob: Blob) => act(async () => finish({ ok: true, blob, width: 1, height: 1 }))
  }
  const LATE = new Blob([new Uint8Array([7])], { type: "image/png" })

  it("an upload still re-encoding when Clear is pressed is dropped", async () => {
    const finish = holdReencode()
    const { onChange, onRemember } = setup()
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await finish(LATE)
    expect(onChange.mock.calls).toEqual([[{ kind: "cleared" }]])
    expect(onRemember).toHaveBeenLastCalledWith({ touched: true, strokes: [], image: null })
    expect(cue()?.textContent).toBe("Draw your signature")
  })

  it("an older upload finishing after a newer one was chosen is dropped", async () => {
    const finishFirst = holdReencode()
    const { onChange } = setup()
    await choose(new File([PNG], "first.png", { type: "image/png" }))
    await choose(new File([PNG], "second.png", { type: "image/png" }))
    expect(onChange).toHaveBeenLastCalledWith({ kind: "uploaded", blob: ENCODED })
    await finishFirst(LATE)
    expect(onChange.mock.calls).toEqual([[{ kind: "uploaded", blob: ENCODED }]])
  })

  it("an upload finishing after the pad unmounted lands nowhere", async () => {
    const finish = holdReencode()
    const { onChange, onRemember, unmount } = setup()
    await choose(new File([PNG], "a.png", { type: "image/png" }))
    unmount()
    await finish(LATE)
    expect(onChange).not.toHaveBeenCalled()
    expect(onRemember).not.toHaveBeenCalled()
  })

  it("a refused file that finishes its check after a Clear shows no error", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" })
    Object.defineProperty(gif, "slice", { value: () => ({ arrayBuffer: async () => (await gate, new ArrayBuffer(3)) }) })
    setup()
    await choose(gif)
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    await act(async () => release())
    expect(screen.queryByText("Choose a PNG or JPEG image.")).toBeNull()
  })

  it.each([
    ["a refused file", () => new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" }), "Choose a PNG or JPEG image."],
    ["an image too large", () => {
      vi.mocked(reencodeImage).mockResolvedValueOnce({ ok: false, reason: "TOO_LARGE" })
      return new File([PNG], "big.png", { type: "image/png" })
    }, "This image is too large. Choose a smaller one."],
  ])("the error after %s clears on the first stroke", async (_name, make, message) => {
    setup()
    await choose(make())
    expect(screen.getByText(message)).toBeTruthy()
    act(() => pad().stroke())
    expect(screen.queryByText(message)).toBeNull()
  })
})
