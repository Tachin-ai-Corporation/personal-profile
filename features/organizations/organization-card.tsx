"use client"

import { useId, type ReactNode, type Ref } from "react"
import { orgLogoPath, type OrganizationPortalItem } from "@/lib/api"
import { FallbackImage } from "@/components/ui/fallback-image"
import { Tooltip } from "@/components/ui/tooltip"
import { providedOrNull } from "@/lib/shared/display-value"
import { orgInitials } from "@/lib/shared/initials"
import { COMMON_MESSAGES } from "@/lib/shared/messages"
import { OrganizationPrimaryContact } from "./organization-primary-contact"
import { OrganizationTypes } from "./organization-types"

export function OrganizationCard({ organization, portalAction, headingRef }: { readonly organization: OrganizationPortalItem; readonly portalAction?: ReactNode; readonly headingRef?: Ref<HTMLHeadingElement> }) {
  const headingId = useId()
  const name = (providedOrNull(organization.shortName)?.trim() ?? providedOrNull(organization.name)?.trim()) || COMMON_MESSAGES.notProvided
  return (
    <article aria-labelledby={headingId} className={`bg-card flex min-w-0 flex-col rounded-md border border-border p-4 ${organization.enabledInTenant ? "text-card-foreground" : "text-muted-foreground"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-18 min-w-0 items-start">
          <FallbackImage src={orgLogoPath(organization.tenantId)} alt="" fallbackWhileLoading className="h-18 max-w-full object-contain object-left" fallback={<span aria-hidden="true" className="bg-muted text-muted-foreground inline-flex size-18 items-center justify-center rounded-md text-section-title font-semibold">{orgInitials(name)}</span>} />
        </div>
        <OrganizationPrimaryContact name={name} contacts={organization.personContacts} />
      </div>
      <Tooltip content={name} wide>
        <h3 ref={headingRef} id={headingId} tabIndex={-1} className="focus-ring mt-3 min-h-11 min-w-0 w-full truncate rounded-sm text-section-title font-semibold outline-none">{name}</h3>
      </Tooltip>
      <OrganizationTypes types={organization.types} />
      {portalAction && <div className="mt-auto pt-4">{portalAction}</div>}
    </article>
  )
}
