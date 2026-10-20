"use client"

import { useId } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField } from "@/components/ui/form-field"
import { InlineBanner } from "@/components/ui/inline-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { COMMON_MESSAGES, formatMessage, MFA_MESSAGES } from "@/lib/shared/messages"
import { AuthenticatorCard, MFA_APPS } from "./authenticator-card"

import { useAuthenticatorController, type AuthenticatorControllerProps } from "./use-authenticator-controller"

export function AuthenticatorLinkDialog(props: AuthenticatorControllerProps) {
  const { cardProps } = props
  const formId = useId()
  const { confirming, disableBusy, busyApp, mutationInert, enrollment, qrLoaded, code, fieldError, notice, validating, input, banner, start, submit, openDisable, confirmDisable, cancelDisable, restoreDisableFocus, restoreLinkFocus, changeCode, pasteCode, brokenQr, qrLoad, cancelLink } = useAuthenticatorController(props)
  const appName = enrollment ? MFA_APPS.find((app) => app.id === enrollment.app)!.name : ""
  return <>
    <AuthenticatorCard {...cardProps} onDisable={openDisable} disableBusy={disableBusy} mutationInert={mutationInert} onLink={(app) => { void start(app) }} busyApp={busyApp} notice={notice && <InlineBanner ref={banner} variant={notice.info ? "info" : "error"} focusable announceKey={notice.attempt}>{notice.text}</InlineBanner>} />
    <ConfirmDialog open={confirming} title={MFA_MESSAGES.disableTitle} body={MFA_MESSAGES.disableBody} confirmLabel={MFA_MESSAGES.turnOff} busyLabel={MFA_MESSAGES.turnOff} variant="destructive" busy={disableBusy} onConfirm={() => { void confirmDisable() }} onCancel={cancelDisable} onCloseFocus={restoreDisableFocus} />
    {/* No DialogTrigger: Radix can only request a dismissal; activation is owned by the card. */}
    <Dialog open={Boolean(enrollment)} onOpenChange={cancelLink}>
      <DialogContent fullScreenOnMobile dismissible={!validating} initialFocus={input} onCloseAutoFocus={(event) => { event.preventDefault(); restoreLinkFocus() }}>
        <DialogHeader><DialogTitle>{formatMessage(MFA_MESSAGES.linkTitle, { App: appName })}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-5">
          <DialogDescription>{formatMessage(MFA_MESSAGES.linkInstruction, { App: appName })}</DialogDescription>
          {enrollment && <div className="bg-qr-surface relative mx-auto w-fit border">
            {/* Transient PNG from the enrollment response; never use an image cache. */}
            {!qrLoaded && <Skeleton aria-hidden="true" className="absolute inset-0 size-[184px] motion-reduce:animate-none" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img onLoad={qrLoad} onError={brokenQr} src={enrollment.qrCode} width={184} height={184} alt={MFA_MESSAGES.qrAlt} className="size-[184px]" />
          </div>}
          <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <FormField label={MFA_MESSAGES.codeLabel} error={fieldError && <span key={fieldError.attempt}>{fieldError.text}</span>}>
              {(control) => <Input {...control} ref={input} value={code} onChange={(event) => changeCode(event.target.value)} onPaste={pasteCode} readOnly={validating} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mono-value h-11 w-[200px] tracking-[0.3em]" />}
            </FormField>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="touch" variant="secondary" aria-disabled={validating || undefined} onClick={cancelLink}>{COMMON_MESSAGES.cancel}</Button>
          <Button type="submit" size="touch" form={formId} busy={validating}>{COMMON_MESSAGES.submit}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
