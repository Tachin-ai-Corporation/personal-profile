"use client"

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent } from "react"
import { unstable_serialize, useSWRConfig } from "swr"
import { sectionHeadingId, toastSuccess, useMyself } from "@/features/shell"
import { disableTotp, mfaDisableTotpPath, enableTotp, keys, mapApiError, mfaEnableTotpPath, mfaValidatePath, sessionEvents, validateTotp, type MappedError } from "@/lib/api"
import { formatMessage, MFA_MESSAGES } from "@/lib/shared/messages"
import { telemetry } from "@/lib/shared/telemetry"
import { MFA_APPS, type AuthenticatorCardProps, type MfaAppId } from "./authenticator-card"
import { mfaCoordinatorFor } from "./mfa-coordinator"

export interface AuthenticatorControllerProps {
  readonly onFailure: (path: string, error: MappedError) => void
  readonly cardProps: Omit<AuthenticatorCardProps, "onLink" | "busyApp" | "notice" | "onDisable" | "disableBusy" | "mutationInert">
}

/** Transient enrollment, confirmed removal, lifecycle and focus; no secrets enter the coordinator. */
export function useAuthenticatorController({ cardProps, onFailure }: AuthenticatorControllerProps) {
  const { mutate, cache } = useSWRConfig()
  const coordinator = mfaCoordinatorFor(cache)
  const coordination = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot)
  // Reuse the shared reader's retry policy; a plain useSWR observer can accidentally
  // become the key's first revalidator and override that policy after child mount.
  useMyself()
  useEffect(() => {
    const read = cache.get(unstable_serialize(keys.myself()))
    coordinator.observeRead(Boolean(read?.data) && !read?.error && !read?.isValidating)
  })
  const [confirming, setConfirming] = useState(false)
  const disableBusy = coordination.phase !== "idle" && coordination.mutation === "disable"
  const disableFocus = useRef<"trigger" | "heading" | "none">("none")
  const busyApp = coordination.phase !== "idle" ? coordination.app ?? null : null
  const [enrollment, setEnrollment] = useState<{ app: MfaAppId; qrCode: string } | null>(null)
  const [qrLoaded, setQrLoaded] = useState(false)
  const [code, setCode] = useState("")
  const [fieldError, setFieldError] = useState<{ text: string; attempt: number } | null>(null)
  const [notice, setNotice] = useState<{ text: string; info: boolean; attempt: number; linked?: boolean; focus?: boolean } | null>(null)
  const [validating, setValidating] = useState(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  const pending = useRef(false)
  const activeToken = useRef<number | null>(null)
  const validatePending = useRef(false)
  const attempts = useRef(0)
  const noticeAttempts = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const banner = useRef<HTMLDivElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const closeFocus = useRef<"origin" | "heading" | "none">("none")

  const clear = (): void => {
    generation.current++
    pending.current = false
    validatePending.current = false
    setConfirming(false)
    setValidating(false)
    setEnrollment(null)
    setQrLoaded(false)
    setCode("")
    setFieldError(null)
    setNotice(null)
  }
  useEffect(() => {
    mounted.current = true
    const hide = (): void => { closeFocus.current = "none"; disableFocus.current = "none"; clear() }
    const unsubscribe = sessionEvents.subscribe("session-expired", hide)
    window.addEventListener("pagehide", hide)
    const requestGeneration = generation
    return () => {
      mounted.current = false
      requestGeneration.current++
      pending.current = false
      validatePending.current = false
      closeFocus.current = "none"
      disableFocus.current = "none"
      unsubscribe()
      window.removeEventListener("pagehide", hide)
      // Unmount discards the component's transient state and its secrets.
    }
  }, [])
  useEffect(() => { if (notice && notice.focus !== false && !sessionEvents.hasPublished("session-expired")) banner.current?.focus() }, [notice])

  const canEnroll = !cardProps.linked && cardProps.state === "ready"
  const canDisable = cardProps.linked && cardProps.state === "ready"
  const [availability, setAvailability] = useState({ canEnroll, canDisable })
  // React's guarded own-state adjustment discards secrets before rendering an unavailable flow.
  // External generation/focus coordination remains in layout effects below.
  if (availability.canEnroll !== canEnroll || availability.canDisable !== canDisable) {
    setAvailability({ canEnroll, canDisable })
    if (!canDisable) setConfirming(false)
    if (!canEnroll) { setValidating(false); setEnrollment(null); setQrLoaded(false); setCode(""); setFieldError(null) }
    if (notice && (cardProps.state !== "ready" || cardProps.linked !== Boolean(notice.linked))) setNotice(null)
  }
  useLayoutEffect(() => {
    generation.current++
    if (!canDisable && disableFocus.current !== "none") disableFocus.current = "heading"
    if (!canEnroll) {
      pending.current = false
      validatePending.current = false
      closeFocus.current = sessionEvents.hasPublished("session-expired") ? "none" : "heading"
    }
  }, [canEnroll, canDisable])

  const focusOwnership = useRef<AbortController | null>(null)
  useEffect(() => () => focusOwnership.current?.abort(), [])
  const watchDisableFocus = (): void => {
    focusOwnership.current?.abort()
    const controller = new AbortController()
    focusOwnership.current = controller
    const relinquish = (): void => { controller.abort() }
    document.addEventListener("pointerdown", relinquish, { signal: controller.signal })
    document.addEventListener("keydown", relinquish, { signal: controller.signal })
    document.addEventListener("focusin", (event) => {
      const target = event.target
      if (target instanceof HTMLElement && !target.matches("[data-mfa-disable]") && target.id !== sectionHeadingId("authenticator")) relinquish()
    }, { signal: controller.signal })
  }
  const refresh = (token = activeToken.current): void => {
    if (sessionEvents.hasPublished("session-expired")) { if (token !== null) coordinator.release(token); return }
    const reconciliationToken = token ?? coordinator.begin("enable")
    if (reconciliationToken === null) return
    void coordinator.reconcile(reconciliationToken, async () => {
      await mutate(keys.myself())
      const read = cache.get(unstable_serialize(keys.myself()))
      // SWR's revalidation promise can resolve with cached data after a failed read.
      return Boolean(read?.data) && !read?.error && !read?.isValidating
    })
  }
  useEffect(() => {
    const ownership = focusOwnership.current
    if (coordination.phase === "idle" && ownership && !ownership.signal.aborted && mounted.current && disableFocus.current !== "none" && !sessionEvents.hasPublished("session-expired") && !document.querySelector("[data-mfa-disable]") && document.activeElement === document.body) {
      document.getElementById(sectionHeadingId("authenticator"))?.focus()
      ownership.abort()
    }
  })

  const close = (focus: "origin" | "heading" | "none", holdApp?: MfaAppId): void => {
    closeFocus.current = focus
    clear()
    if (holdApp && activeToken.current !== null) refresh(activeToken.current)
    else refresh(null)
  }
  // Expiry is published by callApi before it settles; the lifecycle generation
  // discards those results before mapping. Only live permission failures reach this path.
  const fail = (path: string, error: MappedError, fallback: string): void => {
    onFailure(path, error)
    if (error.kind === "forbidden") {
      close("heading")
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
    if (!canEnroll || pending.current || validatePending.current || enrollment || sessionEvents.hasPublished("session-expired")) return
    const token = coordinator.begin("enable", app)
    if (token === null) return
    activeToken.current = token
    pending.current = true
    const current = ++generation.current
    origin.current = document.getElementById(`authenticator-app-${app}`)
    closeFocus.current = "origin"
    attempts.current = 0
    setNotice(null)
    const response = await enableTotp()
    if (!mounted.current || current !== generation.current) { refresh(token); return }
    coordinator.release(token)
    if (!response.success || !response.data) { pending.current = false; fail(mfaEnableTotpPath(), mapApiError("authenticator", response), MFA_MESSAGES.startFailed); return }
    setEnrollment({ app, qrCode: response.data.qrCode })
  }
  const submit = async (): Promise<void> => {
    if (!canEnroll || validatePending.current || !enrollment) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError((previous) => ({ text: MFA_MESSAGES.codeRequired, attempt: (previous?.attempt ?? 0) + 1 }))
      input.current?.focus()
      return
    }
    const token = coordinator.begin("validate", enrollment.app)
    if (token === null) return
    activeToken.current = token
    validatePending.current = true
    const current = generation.current
    const attempt = ++attempts.current
    setValidating(true)
    setFieldError(null)
    const response = await validateTotp(code)
    if (!mounted.current || current !== generation.current) { refresh(token); return }
    validatePending.current = false
    setValidating(false)
    if (!response.success) { coordinator.release(token); fail(mfaValidatePath(), mapApiError("authenticator", response), MFA_MESSAGES.validateFailed); return }
    const ok = response.data === true
    telemetry.track("mfa_link", { ok, attempt })
    if (ok) {
      toastSuccess(formatMessage(MFA_MESSAGES.linked, { App: MFA_APPS.find((app) => app.id === enrollment.app)!.name }))
      close("heading", enrollment.app)
    } else {
      coordinator.release(token)
      setCode("")
      setFieldError({ text: MFA_MESSAGES.codeInvalid, attempt })
      input.current?.focus()
    }
  }
  const openDisable = (): void => {
    if (!canDisable || pending.current || coordinator.getSnapshot().phase !== "idle" || confirming || sessionEvents.hasPublished("session-expired")) return
    setNotice(null)
    disableFocus.current = "trigger"
    setConfirming(true)
  }
  const confirmDisable = async (): Promise<void> => {
    if (!canDisable || !confirming || sessionEvents.hasPublished("session-expired")) return
    const token = coordinator.begin("disable")
    if (token === null) return
    activeToken.current = token
    const current = ++generation.current
    const response = await disableTotp()
    if (!mounted.current || current !== generation.current) { refresh(token); return }
    setConfirming(false)
    if (response.success) {
      disableFocus.current = "heading"
      toastSuccess(MFA_MESSAGES.disabled)
    } else {
      const error = mapApiError("authenticator", response)
      onFailure(mfaDisableTotpPath(), error)
      disableFocus.current = error.kind === "forbidden" ? "heading" : "trigger"
      if (error.kind !== "forbidden" && !sessionEvents.hasPublished("session-expired")) {
        setNotice({ text: error.kind === "generic" && error.message ? error.message : MFA_MESSAGES.disableFailed, info: false, attempt: ++noticeAttempts.current, linked: true, focus: false })
      }
    }
    refresh(token)
  }
  const cancelDisable = (): void => { if (coordinator.getSnapshot().phase !== "mutation") setConfirming(false) }
  const restoreDisableFocus = (): boolean => {
    if (!mounted.current || sessionEvents.hasPublished("session-expired") || disableFocus.current === "none") return true
    const target = disableFocus.current === "trigger" ? document.querySelector<HTMLElement>("[data-mfa-disable]") : null
    const focusTarget = target ?? document.getElementById(sectionHeadingId("authenticator"))
    focusTarget?.focus()
    watchDisableFocus()
    return true
  }
  const restoreLinkFocus = (): void => {
    if (!mounted.current || sessionEvents.hasPublished("session-expired")) return
    if (closeFocus.current === "heading") document.getElementById(sectionHeadingId("authenticator"))?.focus()
    else if (closeFocus.current === "origin" && origin.current?.isConnected) origin.current.focus()
  }
  const changeCode = (value: string): void => { setCode(value.replace(/\D/g, "").slice(0, 6)); setFieldError(null) }
  const pasteCode = (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    if (validatePending.current) return
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "")
    const target = event.currentTarget
    // The shared Input is a text input: DOM selectionStart/End are always numbers.
    // risky-ok: non-null positions follow the text-input platform contract.
    setCode((code.slice(0, target.selectionStart!) + pasted + code.slice(target.selectionEnd!)).slice(0, 6))
    setFieldError(null)
  }
  const brokenQr = (): void => { close("heading"); setNotice({ text: MFA_MESSAGES.startFailed, info: false, attempt: ++noticeAttempts.current }) }
  return {
    confirming: confirming && canDisable, disableBusy, busyApp, mutationInert: coordination.phase !== "idle",
    enrollment: canEnroll ? enrollment : null, qrLoaded, code, fieldError,
    notice: notice && cardProps.state === "ready" && cardProps.linked === Boolean(notice.linked) ? notice : null,
    validating, input, banner, start, submit, openDisable, confirmDisable, close,
    cancelDisable, restoreDisableFocus, restoreLinkFocus, changeCode, pasteCode, brokenQr,
    qrLoad: () => setQrLoaded(true), cancelLink: () => { if (!validatePending.current) close("origin") },
  }
}
