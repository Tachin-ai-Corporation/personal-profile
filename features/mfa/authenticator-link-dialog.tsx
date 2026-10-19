"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormField } from "@/components/ui/form-field"
import { InlineBanner } from "@/components/ui/inline-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { sectionHeadingId, toastSuccess } from "@/features/shell"
import { enableTotp, keys, mapApiError, mfaEnableTotpPath, mfaValidatePath, sessionEvents, validateTotp, type MappedError } from "@/lib/api"
import { COMMON_MESSAGES, formatMessage, MFA_MESSAGES } from "@/lib/shared/messages"
import { telemetry } from "@/lib/shared/telemetry"
import { AuthenticatorCard, MFA_APPS, type AuthenticatorCardProps, type MfaAppId } from "./authenticator-card"

interface Props {
  readonly onFailure: (path: string, error: MappedError) => void
  readonly cardProps: Omit<AuthenticatorCardProps, "onLink" | "busyApp" | "notice">
}

/** Owns all enrollment secrets. Mutations start only from deliberate activation. */
export function AuthenticatorLinkDialog({ cardProps, onFailure }: Props) {
  const { mutate } = useSWRConfig()
  const [busyApp, setBusyApp] = useState<MfaAppId | null>(null)
  const [enrollment, setEnrollment] = useState<{ app: MfaAppId; qrCode: string } | null>(null)
  const [qrLoaded, setQrLoaded] = useState(false)
  const [code, setCode] = useState("")
  const [fieldError, setFieldError] = useState<{ text: string; attempt: number } | null>(null)
  const [notice, setNotice] = useState<{ text: string; info: boolean; attempt: number } | null>(null)
  const [validating, setValidating] = useState(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  const pending = useRef(false)
  const mutationRequestPending = useRef(false)
  const reconciliationPending = useRef(false)
  const validatePending = useRef(false)
  const attempts = useRef(0)
  const noticeAttempts = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const banner = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const closeFocus = useRef<"origin" | "heading" | "none">("none")
  const formId = useId()

  const clear = (): void => {
    generation.current++
    pending.current = false
    validatePending.current = false
    if (!mutationRequestPending.current && !reconciliationPending.current) setBusyApp(null)
    setValidating(false)
    setEnrollment(null)
    setQrLoaded(false)
    setCode("")
    setFieldError(null)
    setNotice(null)
  }
  useEffect(() => {
    mounted.current = true
    const hide = (): void => { closeFocus.current = "none"; clear() }
    const unsubscribe = sessionEvents.subscribe("session-expired", hide)
    window.addEventListener("pagehide", hide)
    return () => {
      mounted.current = false
      // This is a numeric request generation, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      pending.current = false
      validatePending.current = false
      closeFocus.current = "none"
      unsubscribe()
      window.removeEventListener("pagehide", hide)
      // Unmount discards the component's transient state and its secrets.
    }
  }, [])
  useEffect(() => { if (notice && !sessionEvents.hasPublished("session-expired")) banner.current?.focus() }, [notice])

  const canEnroll = !cardProps.linked && cardProps.state === "ready"
  // Reconcile transient state before rendering a newly unavailable card.
  if (!canEnroll && (enrollment || busyApp || notice)) {
    setBusyApp(null)
    setValidating(false)
    setEnrollment(null)
    setQrLoaded(false)
    setCode("")
    setFieldError(null)
    setNotice(null)
  }
  useLayoutEffect(() => {
    if (!canEnroll) {
      generation.current++
      pending.current = false
      validatePending.current = false
      closeFocus.current = sessionEvents.hasPublished("session-expired") ? "none" : "heading"
    }
  }, [canEnroll])

  const refresh = (holdApp?: MfaAppId): void => {
    if (sessionEvents.hasPublished("session-expired")) { setBusyApp(null); return }
    if (holdApp) {
      reconciliationPending.current = true
      setBusyApp(holdApp)
    }
    void mutate(keys.myself()).catch(() => undefined).finally(() => {
      if (!holdApp) return
      reconciliationPending.current = false
      if (mounted.current) setBusyApp(null)
    })
  }
  const close = (focus: "origin" | "heading" | "none", holdApp?: MfaAppId): void => {
    closeFocus.current = focus
    clear()
    refresh(holdApp)
  }
  const fail = (path: string, error: MappedError, fallback: string): void => {
    onFailure(path, error)
    if (error.kind === "session" || error.kind === "forbidden") {
      close(error.kind === "session" ? "none" : "heading")
      // Before the dialog opens there is no Radix close event to restore focus.
      if (path === mfaEnableTotpPath() && error.kind === "forbidden" && !sessionEvents.hasPublished("session-expired")) {
        document.getElementById(sectionHeadingId("authenticator"))?.focus()
      }
      return
    }
    if (error.kind === "coded" && error.code === "TOTP_ALREADY_ENABLED") { close("heading"); return }
    const text = error.kind === "generic" && error.message ? error.message : fallback
    if (path === mfaEnableTotpPath()) {
      const info = error.kind === "coded" && error.code === "MFA_NOT_ENABLED"
      setNotice({ text: info ? MFA_MESSAGES.baseUnavailable : text, info, attempt: ++noticeAttempts.current })
    } else setFieldError({ text, attempt: attempts.current })
  }
  const start = async (app: MfaAppId): Promise<void> => {
    if (!canEnroll || mutationRequestPending.current || reconciliationPending.current || pending.current || validatePending.current || enrollment || sessionEvents.hasPublished("session-expired")) return
    pending.current = true
    mutationRequestPending.current = true
    const current = ++generation.current
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeFocus.current = "origin"
    attempts.current = 0
    setNotice(null)
    setBusyApp(app)
    const response = await enableTotp()
    mutationRequestPending.current = false
    if (!mounted.current) return
    if (current !== generation.current) { refresh(app); return }
    setBusyApp(null)
    if (!response.success || !response.data) { pending.current = false; fail(mfaEnableTotpPath(), mapApiError("authenticator", response), MFA_MESSAGES.startFailed); return }
    setEnrollment({ app, qrCode: response.data.qrCode })
  }
  const submit = async (): Promise<void> => {
    if (!canEnroll || mutationRequestPending.current || reconciliationPending.current || validatePending.current || !enrollment) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError((previous) => ({ text: MFA_MESSAGES.codeRequired, attempt: (previous?.attempt ?? 0) + 1 }))
      input.current?.focus()
      return
    }
    validatePending.current = true
    mutationRequestPending.current = true
    const current = generation.current
    const attempt = ++attempts.current
    setValidating(true)
    setBusyApp(enrollment.app)
    setFieldError(null)
    const response = await validateTotp(code)
    mutationRequestPending.current = false
    if (!mounted.current) return
    if (current !== generation.current) { refresh(enrollment.app); return }
    validatePending.current = false
    setValidating(false)
    setBusyApp(null)
    if (!response.success) { fail(mfaValidatePath(), mapApiError("authenticator", response), MFA_MESSAGES.validateFailed); return }
    const ok = response.data === true
    telemetry.track("mfa_link", { ok, attempt })
    if (ok) {
      toastSuccess(formatMessage(MFA_MESSAGES.linked, { App: MFA_APPS.find((app) => app.id === enrollment.app)!.name }))
      close("heading", enrollment.app)
    } else {
      setCode("")
      setFieldError({ text: MFA_MESSAGES.codeInvalid, attempt })
      input.current?.focus()
    }
  }
  const appName = enrollment ? MFA_APPS.find((app) => app.id === enrollment.app)!.name : ""
  return <>
    <AuthenticatorCard {...cardProps} onLink={(app) => { void start(app) }} busyApp={busyApp} notice={notice && <InlineBanner ref={banner} variant={notice.info ? "info" : "error"} focusable announceKey={notice.attempt}>{notice.text}</InlineBanner>} />
    <Dialog open={Boolean(enrollment)} onOpenChange={(open) => { if (!open && !validatePending.current) close("origin") }}>
      <DialogContent fullScreenOnMobile dismissible={!validating} initialFocus={input} onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (!mounted.current || sessionEvents.hasPublished("session-expired")) return
        if (closeFocus.current === "heading") document.getElementById(sectionHeadingId("authenticator"))?.focus()
        else if (closeFocus.current === "origin" && origin.current?.isConnected) origin.current.focus()
      }}>
        <DialogHeader><DialogTitle>{formatMessage(MFA_MESSAGES.linkTitle, { App: appName })}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-5">
          <DialogDescription>{formatMessage(MFA_MESSAGES.linkInstruction, { App: appName })}</DialogDescription>
          {enrollment && <div className="bg-qr-surface relative mx-auto w-fit border">
            {/* Transient PNG from the enrollment response; never use an image cache. */}
            {!qrLoaded && <Skeleton aria-hidden="true" className="absolute inset-0 size-[184px] motion-reduce:animate-none" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img onLoad={() => setQrLoaded(true)} onError={() => {
              close("heading")
              setNotice({ text: MFA_MESSAGES.startFailed, info: false, attempt: ++noticeAttempts.current })
            }} src={enrollment.qrCode} width={184} height={184} alt={MFA_MESSAGES.qrAlt} className="size-[184px]" />
          </div>}
          <form id={formId} onSubmit={(event) => { event.preventDefault(); void submit() }}>
            <FormField label={MFA_MESSAGES.codeLabel} error={fieldError && <span key={fieldError.attempt}>{fieldError.text}</span>}>
              {(control) => <Input {...control} ref={input} value={code} onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                setFieldError(null)
              }} onPaste={(event) => {
                event.preventDefault()
                if (validatePending.current) return
                const pasted = event.clipboardData.getData("text").replace(/\D/g, "")
                const target = event.currentTarget
                setCode((code.slice(0, target.selectionStart ?? 0) + pasted + code.slice(target.selectionEnd ?? code.length)).slice(0, 6))
                setFieldError(null)
              }} readOnly={validating} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mono-value h-11 w-[200px] tracking-[0.3em]" />}
            </FormField>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="touch" variant="secondary" aria-disabled={validating || undefined} onClick={() => { if (!validatePending.current) close("origin") }}>{COMMON_MESSAGES.cancel}</Button>
          <Button type="submit" size="touch" form={formId} busy={validating}>{COMMON_MESSAGES.submit}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
