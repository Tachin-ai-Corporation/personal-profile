"use client"

import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { handoffHref, isTenantId, useNavigate } from "@/features/shell"
import type { OrganizationPortalItem } from "@/lib/api"
import { providedOrNull } from "@/lib/shared/display-value"
import { COMMON_MESSAGES, formatMessage, ORG_MESSAGES } from "@/lib/shared/messages"

/** Membership identities come from the normalized organization list, never organization URLs. */
export function EnterPortalButton({ organization }: { readonly organization: OrganizationPortalItem }) {
  const navigate = useNavigate()
  const name = (providedOrNull(organization.shortName)?.trim() ?? providedOrNull(organization.name)?.trim()) || COMMON_MESSAGES.notProvided
  const label = formatMessage(ORG_MESSAGES.enterPortalFor, { name })

  // Check before calling handoffHref: its production fallback intentionally accepts a bare route.
  if (organization.enabledInTenant !== true || !isTenantId(organization.tenantId)) {
    return (
      <DisabledAction className="w-full" aria-label={label} reason={ORG_MESSAGES.disabledReason}>
        {ORG_MESSAGES.enterPortal}
      </DisabledAction>
    )
  }

  return (
    <Button
      type="button"
      size="touch"
      className="w-full"
      aria-label={label}
      onClick={() => void navigate({ external: "handoff", href: handoffHref({ to: "tenant", tenantId: organization.tenantId }) })}
    >
      {ORG_MESSAGES.enterPortal}
    </Button>
  )
}
