"use client"

import type React from "react"
import Image from "next/image"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { environmentConfig, environmentFromReferrer, type Environment } from "@/lib/shared/environments"
import { consumeLaunchIntent } from "@/lib/shared/login-intent"
import { LAUNCH_MESSAGES as M } from "@/lib/shared/messages"
import { normalizeLpl, runLaunchFlow, type LaunchFlowDeps } from "./launch-flow"

/** D9: "Success!" stays on screen this long before the hard navigation. */
export const SUCCESS_REDIRECT_DELAY_MS = 1200

type View =
  | { readonly name: "idle" }
  | { readonly name: "choose" }
  | { readonly name: "manual" }
  | { readonly name: "loading"; readonly attempt: number }
  | { readonly name: "success" }
  | { readonly name: "error"; readonly title: string; readonly message: string }

export interface AuthScreenProps {
  /** The `onehealth_environment` cookie, read by the server wrapper (the client never reads cookies). */
  readonly rememberedEnvironment: Environment | null
  /**
   * The environments this deployment can launch (server wrapper, `ENVIRONMENTS`
   * order; names only, D18): the Choose Environment options and the referrers
   * recognised. Dev appears only when configured.
   */
  readonly environments: readonly Environment[]
  /** Test seams. */
  readonly flowDeps?: LaunchFlowDeps
  readonly navigate?: (target: string) => void
}

/** Display-only environment (D2): referrer first, then the remembered cookie. Never sent with a request. */
function displayEnvironment(remembered: Environment | null, configured: readonly Environment[]): Environment | null {
  return (typeof document !== "undefined" && document.referrer ? environmentFromReferrer(document.referrer, configured) : null) ?? remembered
}

/** Removes `lpl` from the address bar before any request (Story 1.2), returning its value. */
function takeLplFromUrl(): string {
  const url = new URL(window.location.href)
  const lpl = url.searchParams.get("lpl")
  if (lpl === null) return ""
  url.searchParams.delete("lpl")
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  return normalizeLpl(lpl)
}

function Logo({ pulse = false, size = 80 }: { pulse?: boolean; size?: number }) {
  return (
    <Image
      src="/1h-icon.png"
      alt="1health"
      width={size}
      height={size}
      className={`rounded-2xl shadow-lg ${pulse ? "animate-pulse-subtle" : ""}`}
      priority
    />
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md flex flex-col items-center gap-6">{children}</div>
    </main>
  )
}

/** The `/auth` launch screen (Story 1.2, D9, as patient-vault `app/auth/page.tsx`). */
export function AuthScreen({ rememberedEnvironment, environments, flowDeps, navigate }: AuthScreenProps) {
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [view, setView] = useState<View>({ name: "idle" })
  const [manualLpl, setManualLpl] = useState("")
  const started = useRef(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const shown: Environment = environment ?? rememberedEnvironment ?? "prod"
  const label = environmentConfig(shown).label
  const portalUrl = environmentConfig(shown).portalUrl

  async function launch(lpl: string) {
    const result = await runLaunchFlow(lpl, { ...flowDeps, onAttempt: (attempt) => setView({ name: "loading", attempt }) })
    if (result.kind === "error") {
      setView({ name: "error", title: result.title, message: result.message })
      return
    }
    setView({ name: "success" })
    const go = navigate ?? ((target: string) => window.location.assign(target))
    // A launch always lands on `/`; the intent counts only when its pathname is `/` (D9, amended 2026-10-14).
    redirectTimer.current = setTimeout(() => go(consumeLaunchIntent()), SUCCESS_REDIRECT_DELAY_MS)
  }

  const onMount = useEffectEvent(() => {
    const detected = displayEnvironment(rememberedEnvironment, environments)
    setEnvironment(detected)
    const lpl = takeLplFromUrl()
    if (lpl) void launch(lpl)
    else setView(detected ? { name: "manual" } : { name: "choose" })
  })

  // Never navigate after the screen has unmounted.
  useEffect(() => () => clearTimeout(redirectTimer.current), [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    onMount()
  }, [])

  function submitManual(event: React.FormEvent) {
    event.preventDefault()
    const lpl = normalizeLpl(manualLpl)
    if (lpl) void launch(lpl)
  }

  const goTo1health = (variant: "default" | "outline") => (
    <Button variant={variant} asChild>
      <a href={portalUrl}>{M.goTo1health(label)}</a>
    </Button>
  )
  const switchEnvironment = (
    <Button variant="ghost" onClick={() => setView({ name: "choose" })}>
      {M.switchEnvironment}
    </Button>
  )

  if (view.name === "idle") {
    return (
      <Screen>
        <Logo pulse size={96} />
        <p className="text-muted-foreground">{M.initializing}</p>
      </Screen>
    )
  }

  if (view.name === "loading") {
    const first = view.attempt === 1
    return (
      <Screen>
        <Logo pulse size={96} />
        <div className="text-center" role="status" aria-live="polite">
          <h1 className="text-xl font-semibold text-foreground">{first ? M.authenticatingTitle : M.confirmingTitle}</h1>
          <p className="text-muted-foreground mt-1">{first ? M.connectingTo(label) : M.confirmingBody}</p>
        </div>
      </Screen>
    )
  }

  if (view.name === "success") {
    return (
      <Screen>
        <div className="w-20 h-20 rounded-full bg-success flex items-center justify-center shadow-lg">
          <CheckCircle2 className="w-12 h-12 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="text-center" role="status" aria-live="polite">
          <h1 className="text-xl font-semibold text-foreground">{M.successTitle}</h1>
          <p className="text-muted-foreground mt-1">{M.successBody}</p>
        </div>
      </Screen>
    )
  }

  if (view.name === "error") {
    return (
      <Screen>
        <Logo size={64} />
        <div className="w-full flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{view.title}</AlertTitle>
            <AlertDescription>{view.message}</AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => setView({ name: "manual" })}>
              {M.enterManually}
            </Button>
            <Button variant="outline" onClick={() => setView({ name: "choose" })}>
              {M.switchEnvironment}
            </Button>
            {goTo1health("default")}
          </div>
        </div>
      </Screen>
    )
  }

  if (view.name === "choose") {
    return (
      <Screen>
        <Logo />
        <Card className="w-full border-border">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{M.chooseTitle}</CardTitle>
            <CardDescription>{M.chooseDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {environments.map((choice) => (
              <Button
                key={choice}
                variant="outline"
                className="h-16 text-lg justify-start"
                onClick={() => {
                  setEnvironment(choice)
                  setView({ name: "manual" })
                }}
              >
                {environmentConfig(choice).label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <Logo size={64} />
      <Card className="w-full border-border">
        <CardHeader>
          <CardTitle>{M.manualTitle}</CardTitle>
          <CardDescription>{M.manualDescription(label)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={submitManual} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lpl">{M.lplLabel}</Label>
              <Input
                id="lpl"
                type="text"
                autoComplete="off"
                placeholder={M.lplPlaceholder}
                value={manualLpl}
                onChange={(event) => setManualLpl(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!manualLpl.trim()}>
              {M.submit}
            </Button>
          </form>
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{M.or}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {goTo1health("outline")}
            {switchEnvironment}
          </div>
        </CardContent>
      </Card>
    </Screen>
  )
}
