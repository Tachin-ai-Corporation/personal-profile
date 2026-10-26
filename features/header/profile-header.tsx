"use client"

import { Camera, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { FallbackImage } from "@/components/ui/fallback-image"
import { Skeleton } from "@/components/ui/skeleton"
import { DESKTOP_QUERY, useCurrentPage, useMediaQuery, useMyself } from "@/features/shell"
import { initials } from "@/lib/shared/initials"
import { HEADER_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { cn } from "@/lib/utils"
import { ChangePictureDialog } from "./change-picture-dialog"
import { displayName, hasPersonName } from "./names"
import { evaluatePictureFile, PICTURE_ACCEPT, type PictureChoice } from "./picture-file"
import { usePrimaryContacts } from "./use-primary-contacts"
import { useProfilePictureSrc } from "./use-profile-picture"

/** 40 px avatar: initials (primary-text, 600) on a card circle with a border; a user icon without a name. */
function Avatar({ text }: { readonly text: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-body-sm font-semibold text-primary-text"
    >
      {text || <UserRound className="size-5" />}
    </span>
  )
}

/**
 * The avatar with the Profile Picture (Story 1.9): the initials avatar shows
 * while the id or the image loads, without a picture, and when either fails.
 * The image is decorative (`alt=""`): the name is the page's `h1`, and the
 * fallback is `aria-hidden` too, so the swap never changes what is announced.
 * `src` comes from `useProfilePictureSrc()`, called by the header so the id
 * loads alongside `myself` rather than after it.
 */
function PictureAvatar({ src, text }: { readonly src: string | null; readonly text: string }) {
  return (
    <FallbackImage
      src={src}
      alt=""
      fallbackWhileLoading
      fallback={<Avatar text={text} />}
      className="size-10 shrink-0 rounded-full border border-border bg-card object-cover"
    />
  )
}

/**
 * The avatar as the "Change profile picture" button (Story 1.10, `/` only):
 * a 44 × 44 hit area around the 40 px circle (the negative margin keeps the
 * header's layout), the focus ring and an 18 px camera badge. It opens the
 * native picker; a chosen file is evaluated once (type, 6 MB, decode) and
 * opens the dialog. Cancelling the picker returns focus here.
 */
function EditablePictureAvatar({ src, text }: { readonly src: string | null; readonly text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState<{ readonly choice: PictureChoice; readonly previewUrl: string | null } | null>(null)
  /** The preview's object URL: revoked when the choice is replaced, the dialog closes or the header unmounts. */
  const previewUrl = useRef<string | null>(null)
  /** The latest evaluation wins (a slow decode never overrides a newer choice). */
  const evaluation = useRef(0)

  const show = (next: PictureChoice | null): void => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = next?.status === "valid" ? URL.createObjectURL(next.file) : null
    setShown(next ? { choice: next, previewUrl: previewUrl.current } : null)
  }

  useEffect(
    () => () => {
      // A late evaluation after unmount must not create an object URL nobody revokes.
      evaluation.current += 1
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    },
    [],
  )

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const refocus = (): void => buttonRef.current?.focus()
    input.addEventListener("cancel", refocus)
    return () => input.removeEventListener("cancel", refocus)
  }, [])

  const choose = (file: File): void => {
    const id = ++evaluation.current
    void evaluatePictureFile(file).then((evaluated) => {
      if (id === evaluation.current) show(evaluated)
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={HEADER_MESSAGES.changePicture}
        onClick={() => inputRef.current?.click()}
        className="focus-ring relative -m-0.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none"
      >
        <PictureAvatar src={src} text={text} />
        <span
          aria-hidden="true"
          data-slot="camera-badge"
          className="absolute right-0 bottom-0 flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card"
        >
          <Camera className="size-[11px]" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={PICTURE_ACCEPT}
        hidden
        tabIndex={-1}
        data-testid="avatar-picture-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) choose(file)
          else buttonRef.current?.focus()
        }}
      />
      <ChangePictureDialog
        choice={shown?.choice ?? null}
        previewUrl={shown?.previewUrl ?? null}
        onChoose={choose}
        onClose={() => {
          evaluation.current += 1
          show(null)
        }}
        onSaveStart={() => {
          // An evaluation still pending must not swap the file being saved.
          evaluation.current += 1
        }}
        currentSrc={src}
        initialsText={text}
        avatarRef={buttonRef}
      />
    </>
  )
}

function ContactItem({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="flex flex-col items-end">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

/**
 * The shared profile header (Story 1.9): the avatar (Profile Picture, else
 * initials) + `{firstName} {lastName}` as the page's single `h1`. At 768 px and
 * above it also shows the primary phone and email; below, nothing is fetched.
 * On `/` the avatar is the "Change profile picture" button (Story 1.10).
 */
export function ProfileHeader() {
  const { myself, isLoading } = useMyself()
  // Without a name (loading, failed or blank) the h1 still names the page for assistive tech.
  const currentPage = useCurrentPage()
  const pageName = currentPage === "account" ? SHELL_MESSAGES.pageAccount : SHELL_MESSAGES.pageProfile
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { phone, email } = usePrimaryContacts(isDesktop)
  const pictureSrc = useProfilePictureSrc()

  const name = myself ? displayName(myself) : ""
  // Display-only, as in 1health-fe: CSS capitalizes the shown name; the text itself is unchanged.
  const capitalize = myself ? hasPersonName(myself) : false
  const avatarText = myself ? initials(myself.firstName, myself.lastName) : ""

  return (
    <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-4 md:px-6">
      {isLoading ? (
        <>
          <h1 className="sr-only">{pageName}</h1>
          <div role="status" aria-label={HEADER_MESSAGES.loading} className="flex min-h-10 items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-6 w-48 motion-reduce:animate-none" />
          </div>
        </>
      ) : (
        <>
          {/* Decision 2026-10-14: the avatar is a button only on `/`; on `/account` it stays an image. */}
          {currentPage === "profile" ? (
            <EditablePictureAvatar src={pictureSrc} text={avatarText} />
          ) : (
            <PictureAvatar src={pictureSrc} text={avatarText} />
          )}
          <h1 className={cn("min-w-0 truncate text-h4 text-foreground", capitalize && "capitalize")}>{name || <span className="sr-only">{pageName}</span>}</h1>
        </>
      )}
      {isDesktop && (phone || email) ? (
        <dl className="ml-auto flex gap-6">
          {phone ? (
            <ContactItem
              label={HEADER_MESSAGES.primaryPhone}
              value={phone.value === null ? null : formatPhoneDisplay(phone.value, phone.phoneNumberRegion)}
            />
          ) : null}
          {email ? <ContactItem label={HEADER_MESSAGES.primaryEmail} value={email.value} /> : null}
        </dl>
      ) : null}
    </div>
  )
}
