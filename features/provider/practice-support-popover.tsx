"use client"

import { useId, useState } from "react"
import useSWR from "swr"
import { InfoPopover, LinkTextButton, type InfoPopoverState } from "@/components/ui/info-popover"
import { keys, mapFetchError, type ApiResponseError } from "@/lib/api"
import type { PracticeSupportBody } from "@/lib/shared/bff-contract"
import { isNotProvided } from "@/lib/shared/display-value"
import { NPI_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { safeHref } from "@/lib/shared/safe-href"

export function PracticeSupportPopover({ name }: { readonly name: string }) {
  const [opening, setOpening] = useState<"idle" | "loading" | "ready">("idle")
  const contentId = useId()
  const { data, error, isLoading, isValidating, mutate } = useSWR<PracticeSupportBody, ApiResponseError>(keys.practiceSupport(), { revalidateOnFocus: false, revalidateOnReconnect: false, revalidateOnMount: false })
  const mapped = error ? mapFetchError("provider", error) : undefined
  let state: InfoPopoverState | undefined
  if (isLoading || isValidating || opening !== "ready") state = "loading"
  else if (mapped?.kind === "forbidden") state = "forbidden"
  else if (mapped && mapped.kind !== "session") state = "error"
  const support = mapped ? undefined : data
  const supportName = !isNotProvided(support?.name) ? support?.name : undefined
  const rawPhone = support?.phone
  const phone = rawPhone && !isNotProvided(rawPhone) ? formatPhoneDisplay(rawPhone, support?.phoneRegion) : undefined
  const email = !isNotProvided(support?.email) ? support?.email : undefined
  const href = email ? safeHref(`mailto:${email}`, ["mailto:"]) : undefined

  return <InfoPopover label={NPI_MESSAGES.practiceName} contentId={contentId} trigger={<LinkTextButton className="min-w-11 max-w-full break-words">{name}</LinkTextButton>} state={state} errorMessage={NPI_MESSAGES.practiceSupportLoadError} onOpenChange={(open) => {
    if (!open || opening !== "idle") return
    setOpening("loading")
    // Force this required key to revalidate: another practice may still have a
    // read in flight. SWR discards that older response; contact data stays in SWR.
    void mutate().then(() => setOpening("ready"))
  }} onRetry={() => void mutate()}>
    {mapped?.kind === "session" ? null : <div className="space-y-1 break-words">
      {supportName ? <p className="font-semibold">{supportName}</p> : null}
      {phone ? <p className="tabular-nums">{phone}</p> : null}
      {email ? <p>{href ? <a className="text-link-text inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-ring" href={href}>{email}</a> : email}</p> : null}
      {!supportName && !phone && !email ? "-" : null}
    </div>}
  </InfoPopover>
}
