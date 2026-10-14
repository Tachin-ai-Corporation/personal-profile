import { SHELL_COPY } from "@/lib/shared/messages"

/**
 * The Medical tab body (FR-32, RC9): a quiet centred panel with the locked
 * "Coming soon" text. No action and no network request.
 */
export function MedicalPanel() {
  return (
    <div className="flex min-h-60 items-center justify-center px-4 py-12 text-center md:px-6">
      <p className="max-w-md text-body text-muted-foreground">{SHELL_COPY.medical}</p>
    </div>
  )
}
