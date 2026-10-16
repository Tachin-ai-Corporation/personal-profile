"use client"

import { Info, UserRound } from "lucide-react"
import { useId, useRef, useState, type RefObject } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FallbackImage } from "@/components/ui/fallback-image"
import { FieldError } from "@/components/ui/form-field"
import { reencodeImage } from "@/components/ui/image-reencode"
import { InlineBanner } from "@/components/ui/inline-banner"
import { toastSuccess } from "@/features/shell"
import {
  deleteProfilePictureFile,
  fetchProfilePictureId,
  isUploadRejected,
  keys,
  mapApiError,
  profilePicturePreviewPath,
  uploadProfilePicture,
  type ApiResponse,
} from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, HEADER_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { formatPictureFileSize, PICTURE_ACCEPT, PICTURE_REENCODE, type PictureChoice } from "./picture-file"

/** How long Save waits for the new picture to load before it updates the avatar anyway. */
export const PICTURE_PRELOAD_TIMEOUT_MS = 5000

/**
 * Loads `src` once so the header's `<img>` finds it ready (no initials flash,
 * 1.9 review note). Resolves on load, error or after `timeoutMs`, whichever
 * comes first; never rejects. Returns the image so the caller keeps it alive
 * until the avatar has switched.
 */
function preloadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const image = new Image()
    const done = (): void => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(image)
    }
    const timer = setTimeout(done, timeoutMs)
    image.onload = done
    image.onerror = done
    image.src = src
  })
}

type SaveState =
  | { readonly phase: "idle" }
  | { readonly phase: "saving" }
  /** 413 / 415 or a re-encode that couldn't reach 4 MB: choose another file. */
  | { readonly phase: "rejected" }
  /** Network, 5xx or another failure: Retry re-runs with the same blob. */
  | { readonly phase: "failed"; readonly attempt: number }

const IDLE: SaveState = { phase: "idle" }

type SaveOutcome = "saved" | "rejected" | "failed" | "session"

export interface ChangePictureDialogProps {
  /** The chosen file, evaluated; `null` closes the dialog. */
  readonly choice: PictureChoice | null
  /** The object URL of a valid choice (owned and revoked by the caller). */
  readonly previewUrl: string | null
  /** "Choose another file" picked a file: evaluate it and pass the new `choice`. */
  readonly onChoose: (file: File) => void
  /** The dialog closed (Cancel, Escape, Close, saved, session ended). */
  readonly onClose: () => void
  /** A save started: a pending "Choose another file" evaluation must not replace the file being saved. */
  readonly onSaveStart: () => void
  /** The header avatar's current image (shown, captioned "Current picture", for an unusable file). */
  readonly currentSrc: string | null
  /** The initials shown without a picture (empty: the user icon). */
  readonly initialsText: string
  /** The avatar button: focus goes back to it when the dialog closes. */
  readonly avatarRef: RefObject<HTMLButtonElement | null>
}

/**
 * The "Change profile picture" dialog (Story 1.10, FR10): a 96 px preview of
 * the chosen file (or the current picture with the reason it can't be used),
 * "Choose another file", the rules line, Cancel and Save. Save re-encodes the
 * file to a JPEG of at most 4 MB (never the original bytes, D-C), reads the
 * current picture id, uploads, deletes the old picture best-effort, preloads
 * the new one, sets `keys.profilePictureId()`, closes, toasts and focuses the
 * avatar.
 */
export function ChangePictureDialog({ choice, previewUrl, onChoose, onClose, onSaveStart, currentSrc, initialsText, avatarRef }: ChangePictureDialogProps) {
  const { mutate } = useSWRConfig()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  /** The save state of one file: another file (or none) starts over at idle. */
  const [saveOf, setSaveOf] = useState<{ readonly file: File | null; readonly state: SaveState }>({ file: null, state: IDLE })
  /**
   * The re-encoded blob of the current file, reused by Retry, and every picture
   * id read before one of its uploads: a Retry after a lost upload response
   * reads that upload's id as "before", so the original picture is remembered
   * here too and deleted once a later attempt succeeds. Cleared on close.
   */
  const cacheRef = useRef<{ readonly file: File; readonly blob: Blob; readonly oldIds: Set<number> } | null>(null)
  /** The preloaded new picture, kept alive until the dialog closes. */
  const preloadedRef = useRef<HTMLImageElement | null>(null)
  /** Set before a close that must not move focus (the session dialog takes over). */
  const skipFocusRef = useRef(false)

  const file = choice?.file ?? null
  const valid = choice?.status === "valid"
  const save = saveOf.file === file ? saveOf.state : IDLE
  const saving = save.phase === "saving"
  const setSave = (chosen: File, state: SaveState): void => setSaveOf({ file: chosen, state })

  /** Every close: drop the cached blob (up to 4 MB) and the remembered ids. */
  const finish = (): void => {
    cacheRef.current = null
    onClose()
  }

  const close = (): void => {
    if (saving) return
    finish()
  }

  const openPicker = (): void => {
    if (!saving) inputRef.current?.click()
  }

  /** One save attempt; reuses the blob (and the remembered ids) of an earlier attempt for the same file. */
  async function attempt(chosen: File): Promise<SaveOutcome> {
    let cache = cacheRef.current?.file === chosen ? cacheRef.current : null
    if (!cache) {
      const encoded = await reencodeImage(chosen, PICTURE_REENCODE)
      if (!encoded.ok) return "rejected"
      cache = { file: chosen, blob: encoded.blob, oldIds: new Set<number>() }
      cacheRef.current = cache
    }
    const isSession = (response: ApiResponse<unknown>): boolean => mapApiError("page", response).kind === "session"
    const failure = (response: ApiResponse<unknown>): SaveOutcome => {
      if (isSession(response)) return "session"
      return isUploadRejected(mapApiError("page", response)) ? "rejected" : "failed"
    }

    const before = await fetchProfilePictureId()
    if (!before.success) return failure(before)
    if (before.data?.fileId != null) cache.oldIds.add(before.data.fileId)
    const uploaded = await uploadProfilePicture(cache.blob, chosen.name)
    if (!uploaded.success) return failure(uploaded)

    // The new id first: an old picture is deleted only once a different new one is confirmed.
    const after = await fetchProfilePictureId()
    if (!after.success || !after.data) {
      if (isSession(after)) return "session"
      await mutate(keys.profilePictureId())
      return "saved"
    }
    const newId = after.data.fileId
    if (newId !== null) {
      for (const oldId of cache.oldIds) {
        if (oldId === newId) continue
        // Best effort: a failed delete is still a saved picture, and shows nothing.
        const deleted = await deleteProfilePictureFile(oldId)
        if (!deleted.success && isSession(deleted)) return "session"
      }
    }
    const src = profilePicturePreviewPath(newId)
    if (src !== null) preloadedRef.current = await preloadImage(src, PICTURE_PRELOAD_TIMEOUT_MS)
    await mutate(keys.profilePictureId(), after.data, { revalidate: false })
    return "saved"
  }

  async function runSave(): Promise<void> {
    if (!file || !valid || saving || save.phase === "rejected") return
    const failures = save.phase === "failed" ? save.attempt : 0
    setSave(file, { phase: "saving" })
    onSaveStart()
    const outcome = await attempt(file)
    if (outcome === "saved" || outcome === "session") {
      skipFocusRef.current = outcome === "session"
      setSave(file, IDLE)
      finish()
      if (outcome === "saved") toastSuccess(HEADER_MESSAGES.pictureSaved)
      return
    }
    setSave(file, outcome === "rejected" ? { phase: "rejected" } : { phase: "failed", attempt: failures + 1 })
  }

  const fileError =
    choice?.status === "tooLarge"
      ? formatMessage(HEADER_MESSAGES.pictureTooLarge, { fileName: choice.file.name, size: formatPictureFileSize(choice.file.size) })
      : choice?.status === "wrongType"
        ? formatMessage(HEADER_MESSAGES.pictureWrongType, { fileName: choice.file.name })
        : null
  const rejected = save.phase === "rejected" && file ? formatMessage(COMMON_MESSAGES.uploadRejected, { fileName: file.name }) : null
  const saveBlocked = fileError !== null || rejected !== null

  return (
    <Dialog open={choice !== null} onOpenChange={(open) => (open ? undefined : close())}>
      {choice ? (
        <DialogContent
          aria-describedby={undefined}
          dismissible={!saving}
          initialFocus={cancelRef}
          onOpenAutoFocus={() => {
            skipFocusRef.current = false
            preloadedRef.current = null
          }}
          onCloseAutoFocus={(event) => {
            // Focus goes back to the avatar on every close, unless the session dialog took over.
            event.preventDefault()
            if (!skipFocusRef.current) avatarRef.current?.focus()
            preloadedRef.current = null
          }}
        >
          <DialogHeader>
            <DialogTitle>{HEADER_MESSAGES.changePicture}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              {valid ? (
                previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- an object URL preview; next/image can't serve it
                  <img
                    src={previewUrl}
                    alt={HEADER_MESSAGES.newPicturePreview}
                    className="size-24 shrink-0 rounded-full border border-border bg-card object-cover"
                  />
                ) : (
                  <span aria-hidden="true" className="size-24 shrink-0 rounded-full border border-border bg-card" />
                )
              ) : (
                <FallbackImage
                  src={currentSrc}
                  alt=""
                  fallbackWhileLoading
                  fallback={
                    <span
                      aria-hidden="true"
                      className="flex size-24 shrink-0 items-center justify-center rounded-full border border-border bg-card text-h4 font-semibold text-primary-text"
                    >
                      {initialsText || <UserRound className="size-10" />}
                    </span>
                  }
                  className="size-24 shrink-0 rounded-full border border-border bg-card object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                {valid ? (
                  <>
                    <p className="w-full truncate text-body-sm font-medium text-foreground">
                      {choice.file.name}
                    </p>
                    <p className="text-body-sm text-muted-foreground">
                      {formatMessage(HEADER_MESSAGES.pictureFileMeta, { type: choice.type, size: formatPictureFileSize(choice.file.size) })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-body-sm font-medium text-foreground">{HEADER_MESSAGES.currentPicture}</p>
                    <p className="text-body-sm text-muted-foreground">{HEADER_MESSAGES.notChanged}</p>
                  </>
                )}
                <Button type="button" variant="outline" size="touch" className="mt-1" aria-disabled={saving || undefined} onClick={openPicker}>
                  {HEADER_MESSAGES.chooseAnotherFile}
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={PICTURE_ACCEPT}
                  hidden
                  tabIndex={-1}
                  data-testid="change-picture-input"
                  onChange={(event) => {
                    const chosen = event.currentTarget.files?.[0]
                    event.currentTarget.value = ""
                    if (chosen && !saving) onChoose(chosen)
                  }}
                />
              </div>
            </div>
            <div role="alert">{fileError ? <FieldError id={errorId}>{fileError}</FieldError> : null}</div>
            <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
              <Info aria-hidden="true" className="size-4 shrink-0" />
              {HEADER_MESSAGES.pictureRules}
            </p>
            <div role="alert">{rejected ? <FieldError id={errorId}>{rejected}</FieldError> : null}</div>
            {save.phase === "failed" ? (
              <InlineBanner
                variant="error"
                announceKey={save.attempt}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() => {
                      // The banner goes away while saving: keep focus on the busy Save.
                      saveRef.current?.focus()
                      void runSave()
                    }}
                  >
                    {COMMON_MESSAGES.retry}
                  </Button>
                }
              >
                {HEADER_MESSAGES.pictureSaveFailed}
              </InlineBanner>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button ref={cancelRef} type="button" variant="secondary" size="touch" aria-disabled={saving || undefined} onClick={close}>
              {COMMON_MESSAGES.cancel}
            </Button>
            <Button
              ref={saveRef}
              type="button"
              size="touch"
              busy={saving}
              busyLabel={SECTION_MESSAGES.saving}
              aria-disabled={saveBlocked || undefined}
              aria-describedby={saveBlocked ? errorId : undefined}
              onClick={() => void runSave()}
            >
              {COMMON_MESSAGES.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
