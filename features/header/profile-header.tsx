"use client"

import { UserRound } from "lucide-react"
import { FallbackImage } from "@/components/ui/fallback-image"
import { Skeleton } from "@/components/ui/skeleton"
import { DESKTOP_QUERY, useCurrentPage, useMediaQuery, useMyself } from "@/features/shell"
import { initials } from "@/lib/shared/initials"
import { HEADER_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { displayName } from "./names"
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
 */
export function ProfileHeader() {
  const { myself, isLoading } = useMyself()
  // Without a name (loading, failed or blank) the h1 still names the page for assistive tech.
  const pageName = useCurrentPage() === "account" ? SHELL_MESSAGES.pageAccount : SHELL_MESSAGES.pageProfile
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { phone, email } = usePrimaryContacts(isDesktop)
  const pictureSrc = useProfilePictureSrc()

  const name = myself ? displayName(myself) : ""

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
          <PictureAvatar src={pictureSrc} text={myself ? initials(myself.firstName, myself.lastName) : ""} />
          <h1 className="min-w-0 truncate text-h4 text-foreground">{name || <span className="sr-only">{pageName}</span>}</h1>
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
