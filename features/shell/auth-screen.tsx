"use client"

import Image from "next/image"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { callApi } from "@/lib/api"
import { environments, type Environment } from "@/lib/shared/environments"
import { consumeLoginIntent } from "@/lib/shared/login-intent"
import { AUTH_COPY, ENVIRONMENT_LABELS } from "@/lib/shared/messages"
import { environmentFromReferrer, useReferrerEnvironment } from "./display-environment"

/**
 * =============================================================================
 * The `/auth` launch screen (Story 1.2, D9 — patient-vault parity)
 * =============================================================================
 *
 * On mount it reads `lpl` from the address bar, turns every space back into
 * `+` (a `+` in the unencoded base64 query decodes as a space), and removes
 * `lpl` with `history.replaceState` BEFORE sending anything, so no history
 * entry keeps the payload. Then it runs the launch flow:
 *
 *   - each attempt is one `POST /api/token` with body `{ lpl }` and nothing
 *     else: the environment is detected by key on the server (D2);
 *   - at most `MAX_AUTH_ATTEMPTS` (5), `AUTH_RETRY_DELAY_MS` (1,500 ms) apart,
 *     no backoff; it retries a non-OK response unless its body says
 *     `retryable: false`, an OK response without `ok: true`, and a network error;
 *   - on `{ ok: true }` it shows "Success!" and, after 1,200 ms, does a hard
 *     `window.location.assign(consumeLoginIntent("/"))`;
 *   - otherwise the destructive error Alert shows the last attempt's title and
 *     message, with "Enter LPL Manually", "Switch Environment" and "Go to 1health".
 *
 * Without `lpl` it shows the manual-entry card for the shown environment, or
 * the Choose Environment card when none is known. The shown environment (the
 * referrer, then the remembered cookie passed in by the server wrapper, then a
 * choice) only picks labels and links; it is never sent (D2). This screen
 * never reads cookies in the browser, has no framed mode and navigates only
 * the same tab (D10). Every string comes from `messages.ts`.
 * =============================================================================
 */

export const MAX_AUTH_ATTEMPTS = 5
export const AUTH_RETRY_DELAY_MS = 1500
export const SUCCESS_DELAY_MS = 1200

type LaunchError = { title: string; message: string }

type View =
  | { kind: "init" }
  | { kind: "loading"; attempt: number }
  | { kind: "success" }
  | { kind: "error"; error: LaunchError }
  | { kind: "manual" }
  | { kind: "choose" }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** `{ message, retryable }` from a failed `/api/token` body (kept in `details` by `callApi`). */
function readFailure(details: unknown): { message?: string; retryable?: boolean } {
  if (!details || typeof details !== "object") return {}
  const d = details as { message?: unknown; retryable?: unknown }
  return {
    message: typeof d.message === "string" && d.message.length > 0 ? d.message : undefined,
    retryable: typeof d.retryable === "boolean" ? d.retryable : undefined,
  }
}

/** Remove `lpl` from the address bar (and history entry) without navigating. */
function stripLplFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete("lpl")
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

export function AuthScreen({ rememberedEnvironment }: { rememberedEnvironment: Environment | null }) {
  const referred = useReferrerEnvironment()
  // An explicit choice ("Switch Environment" → Choose Environment) wins.
  const [chosen, setChosen] = useState<Environment | null>(null)
  const known = chosen ?? referred ?? rememberedEnvironment
  /** The environment the labels and links use; prod when none is known (D4). */
  const shown: Environment = known ?? "prod"

  const [view, setView] = useState<View>({ kind: "init" })
  const [manualLpl, setManualLpl] = useState("")
  const unmounted = useRef(false)
  const started = useRef(false)

  async function launch(lpl: string): Promise<void> {
    let last: LaunchError = { title: AUTH_COPY.failedTitle, message: AUTH_COPY.failedFallback }
    for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
      if (unmounted.current) return
      setView({ kind: "loading", attempt })
      const res = await callApi<{ ok?: unknown; environment?: unknown }>("auth/token", "/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lpl }),
      })
      if (unmounted.current) return

      if (res.success && res.data?.ok === true) {
        setView({ kind: "success" })
        await sleep(SUCCESS_DELAY_MS)
        if (!unmounted.current) window.location.assign(consumeLoginIntent("/"))
        return
      }

      let stop = false
      if (!res.success && res.statusCode === undefined) {
        // No HTTP response at all: the network failed.
        last = { title: AUTH_COPY.connectionTitle, message: AUTH_COPY.connectionBody }
      } else if (!res.success) {
        const failure = readFailure(res.details)
        last = { title: AUTH_COPY.failedTitle, message: failure.message ?? AUTH_COPY.failedFallback }
        stop = failure.retryable === false
      } else {
        // OK without `ok: true`.
        last = { title: AUTH_COPY.failedTitle, message: AUTH_COPY.failedFallback }
      }

      if (stop || attempt === MAX_AUTH_ATTEMPTS) break
      await sleep(AUTH_RETRY_DELAY_MS)
    }
    if (!unmounted.current) setView({ kind: "error", error: last })
  }

  useEffect(() => {
    unmounted.current = false
    // Run once per page load (Strict Mode mounts effects twice in development).
    if (!started.current) {
      started.current = true
      const raw = new URLSearchParams(window.location.search).get("lpl")
      // Strip before anything is sent, so no history entry keeps the payload.
      if (raw !== null) stripLplFromUrl()
      // Read the referrer directly: the hydration render still had the server
      // snapshot (no referrer).
      const knownAtLoad = environmentFromReferrer(document.referrer) ?? rememberedEnvironment
      // State changes belong to the flow, not to the effect body.
      // An empty or whitespace-only `lpl` is treated exactly like none: no POST
      // (which would also clear any existing session).
      const lpl = raw !== null && raw.trim().length > 0 ? raw.replace(/ /g, "+") : null
      queueMicrotask(() => {
        if (unmounted.current) return
        if (lpl !== null) void launch(lpl)
        else setView({ kind: knownAtLoad ? "manual" : "choose" })
      })
    }
    return () => {
      unmounted.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per page load by design
  }, [])

  const onManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = manualLpl.trim().replace(/ /g, "+")
    if (!value) return
    setManualLpl("")
    void launch(value)
  }

  const chooseEnvironment = (env: Environment) => {
    setChosen(env)
    setView({ kind: "manual" })
  }

  const portalLink = (variant: "default" | "outline") => (
    <Button asChild variant={variant} className="min-h-11">
      <a href={environments[shown].portalUrl}>{AUTH_COPY.goTo1health(shown)}</a>
    </Button>
  )

  if (view.kind === "init" || view.kind === "loading" || view.kind === "success") {
    const title =
      view.kind === "success"
        ? AUTH_COPY.success
        : view.kind === "loading" && view.attempt >= 2
          ? AUTH_COPY.confirming
          : AUTH_COPY.authenticating
    const body =
      view.kind === "success"
        ? AUTH_COPY.loadingApp
        : view.kind === "loading" && view.attempt >= 2
          ? AUTH_COPY.confirmingBody
          : AUTH_COPY.connectingTo(shown)
    return (
      <Shell>
        <div className="flex flex-col items-center gap-6 text-center" role="status" aria-live="polite">
          {view.kind === "success" ? (
            <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          ) : (
            <Loader2 className="size-12 text-primary motion-safe:animate-spin" aria-hidden="true" />
          )}
          {view.kind === "init" ? null : (
            <div className="flex flex-col gap-1">
              <h1 className="text-h4">{title}</h1>
              <p className="text-body-sm text-muted-foreground">{body}</p>
            </div>
          )}
        </div>
      </Shell>
    )
  }

  if (view.kind === "error") {
    return (
      <Shell>
        <div className="flex flex-col gap-4">
          <h1 className="sr-only">{view.error.title}</h1>
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{view.error.title}</AlertTitle>
            <AlertDescription>{view.error.message}</AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setView({ kind: "manual" })}>
              {AUTH_COPY.enterManually}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setView({ kind: "choose" })}>
              {AUTH_COPY.switchEnvironment}
            </Button>
            {portalLink("default")}
          </div>
        </div>
      </Shell>
    )
  }

  if (view.kind === "choose") {
    return (
      <Shell>
        <Card>
          <CardHeader className="text-center">
            <h1 className="text-h4">{AUTH_COPY.chooseTitle}</h1>
            <CardDescription>{AUTH_COPY.chooseDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(["demo", "prod"] as const).map((env) => (
              <Button key={env} variant="outline" className="min-h-11 justify-start" onClick={() => chooseEnvironment(env)}>
                {ENVIRONMENT_LABELS[env]}
              </Button>
            ))}
          </CardContent>
        </Card>
      </Shell>
    )
  }

  // Manual entry.
  return (
    <Shell>
      <Card>
        <CardHeader>
          <h1 className="text-h4">{AUTH_COPY.manualTitle}</h1>
          <CardDescription>{AUTH_COPY.manualDescription(shown)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={onManualSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pp-lpl">{AUTH_COPY.lplLabel}</Label>
              <Input
                id="pp-lpl"
                name="lpl"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={AUTH_COPY.lplPlaceholder}
                value={manualLpl}
                onChange={(e) => setManualLpl(e.target.value)}
              />
            </div>
            <Button type="submit" className="min-h-11" disabled={manualLpl.trim().length === 0}>
              {AUTH_COPY.submit}
            </Button>
          </form>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            <span className="text-caption uppercase text-muted-foreground">{AUTH_COPY.or}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2">
            {portalLink("outline")}
            <Button variant="outline" className="min-h-11" onClick={() => setView({ kind: "choose" })}>
              {AUTH_COPY.switchEnvironment}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Shell>
  )
}

/** The centered full-page frame with the 1health mark. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Image src="/1h-icon.png" alt="1health" width={64} height={64} className="mx-auto rounded-xl" priority />
        {children}
      </div>
    </main>
  )
}
