"use client"

import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { handoffHref, useNavigate } from "@/features/shell"
import type { Myself, UserNpi } from "@/lib/api"
import { NPI_MESSAGES } from "@/lib/shared/messages"
import { useRegisteredPractice } from "./use-registered-practice"

interface RegisteredPracticeActionProps {
  readonly registration: UserNpi
  readonly myself: Myself | undefined
  readonly identityReady: boolean
}

export function RegisteredPracticeAction(props: RegisteredPracticeActionProps) {
  const action = useRegisteredPractice(props.registration, props.myself, props.identityReady)
  const navigate = useNavigate()
  if (action === "notice") return <InlineBanner variant="info">{NPI_MESSAGES.organizationExists}</InlineBanner>
  if (action !== "register") return null
  return <div className="px-3 py-3"><Button variant="outline" className="h-auto min-h-11 whitespace-normal text-left" onClick={() => void navigate({ external: "handoff", href: handoffHref({ to: "create-org" }) })}>{NPI_MESSAGES.registerPractice}</Button></div>
}
