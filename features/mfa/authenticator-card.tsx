"use client"

import type { ReactNode } from "react"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Tooltip } from "@/components/ui/tooltip"
import { SectionLandmark, StateFrame, type FrameState } from "@/features/shell"
import { formatMessage, MFA_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"

export const MFA_APPS = [
  { id: "google", name: MFA_MESSAGES.google },
  { id: "microsoft", name: MFA_MESSAGES.microsoft },
  { id: "authy", name: MFA_MESSAGES.authy },
  { id: "duo", name: MFA_MESSAGES.duo },
  { id: "android-otp", name: MFA_MESSAGES.androidOtp },
] as const

export type MfaAppId = (typeof MFA_APPS)[number]["id"]
const CAPTION_ID = "authenticator-inactive-caption"

export interface AuthenticatorCardProps {
  readonly state: FrameState
  readonly linked: boolean
  readonly onRetry: () => void
  readonly attempt?: number
  readonly onSettled?: () => void
  /** Integration seams for Stories 8.2 and 8.3; this story performs no mutations. */
  readonly onLink?: (app: MfaAppId) => void
  readonly busyApp?: MfaAppId | null
  readonly notice?: ReactNode
  readonly onDisable?: () => void
  readonly disableBusy?: boolean
  readonly mutationInert?: boolean
}

export function AuthenticatorCard({ state, linked, onRetry, attempt, onSettled, onLink, onDisable, busyApp, notice, disableBusy, mutationInert }: AuthenticatorCardProps) {
  return <SectionLandmark id="authenticator" title={SHELL_MESSAGES.authenticatorHeading} tools={state === "ready" ? <>
    <StatusBadge status={linked ? "verified" : "pending"}>{linked ? MFA_MESSAGES.enabled : MFA_MESSAGES.notSetUp}</StatusBadge>
    {linked && <Button type="button" variant="outline-destructive" size="touch" data-mfa-disable busy={disableBusy} busyLabel={MFA_MESSAGES.disable} aria-disabled={mutationInert || undefined} onClick={(event) => { event.currentTarget.focus(); onDisable?.() }}>{MFA_MESSAGES.disable}</Button>}
  </> : undefined}>
    <StateFrame state={state} className={state === "ready" ? "overflow-visible" : undefined} skeleton="tiles" loadError={{ kind: "page" }} level="section" onRetry={onRetry} attempt={attempt} onSettled={onSettled}>
      <div className="space-y-3 py-3">
        {notice}
        <p className="text-muted-foreground text-body-sm px-3">{MFA_MESSAGES.intro}</p>
        <div className="grid grid-cols-2 gap-3 min-[360px]:grid-cols-3 md:flex md:gap-4">
          {/* The non-null empty content keeps the same trigger DOM and focus across linked transitions. */}
          {MFA_APPS.map((app) => <Tooltip key={app.id} content={linked ? MFA_MESSAGES.inactiveReason : <></>} contentClassName={linked ? undefined : "hidden"} keepOpenOnPress>
            <Button id={`authenticator-app-${app.id}`} type="button" variant="outline" aria-label={formatMessage(MFA_MESSAGES.linkApp, { App: app.name })} aria-haspopup="dialog"
              busy={busyApp === app.id} aria-disabled={linked || Boolean(busyApp) || mutationInert || undefined} aria-describedby={linked ? CAPTION_ID : undefined}
              className="bg-card hover:bg-accent dark:bg-card dark:hover:bg-accent dark:border-border transition-colors grid h-auto min-w-24 w-full grid-cols-1 whitespace-normal p-0 before:col-start-1 before:row-start-1 before:aspect-square before:w-full before:content-[''] aria-disabled:opacity-[0.55] md:w-28 md:shrink-0"
              onClick={(event) => { event.currentTarget.focus(); onLink?.(app.id) }}>
              {/* The empty grid item reserves a square; enlarged text can grow the content row. */}
              <div className="col-start-1 row-start-1 flex w-full min-w-0 flex-col items-center gap-2 py-2">
                {/* Original decorative vendor artwork; same-origin under the image CSP. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/mfa/${app.id}.png`} alt="" aria-hidden="true" width={48} height={48} className="size-12 shrink-0 object-contain" />
                <span className="cell-strong max-w-full wrap-anywhere">{app.name}</span>
              </div>
            </Button>
          </Tooltip>)}
        </div>
        {linked && <p id={CAPTION_ID} className="text-muted-foreground text-body-sm flex items-start gap-2 px-3">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{MFA_MESSAGES.inactiveReason}
        </p>}
      </div>
    </StateFrame>
  </SectionLandmark>
}
